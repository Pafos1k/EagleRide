import pg from 'pg';
import type {Request,Response} from 'express';
import type {Pool} from 'pg';
const streams=new Map<string,number>();
let total=0;
// Dedicated LISTEN connection per open stream; no message bodies are sent over SSE.
// Reconnect opens a freshly authenticated stream and fetches durable history.
export async function chatEvents(pool:Pool,req:Request,res:Response,userId:string,rideId:string){
  if(total>=100 || (streams.get(userId)??0)>=5){res.status(429).end();return;}
  total++;streams.set(userId,(streams.get(userId)??0)+1);
  const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  let closed=false,checking=false,again=false;
  let heartbeat:ReturnType<typeof setInterval>|undefined,expiry:ReturnType<typeof setTimeout>|undefined;
  const close=()=>{if(closed)return;closed=true;total--;const remaining=(streams.get(userId)??1)-1;if(remaining)streams.set(userId,remaining);else streams.delete(userId);clearInterval(heartbeat);clearTimeout(expiry);void client.end().catch(()=>{});res.end();};
  res.on('close',close);client.on('error',close);
  try{
    await client.connect();if(closed)return;
    await client.query('LISTEN ride_chat');
    const check=async()=>{
      if(closed)return;if(checking){again=true;return;}checking=true;
      try{
        do {again=false;
          const member=await pool.query('SELECT 1 FROM ride_participants WHERE ride_id=$1 AND user_id=$2 AND left_at IS NULL',[rideId,userId]);
          if(!member.rowCount){if(!res.headersSent)res.status(403);else res.write('event: forbidden\ndata: {}\n\n');close();return;}
          if(!res.headersSent){res.set({'Content-Type':'text/event-stream','Cache-Control':'private, no-store','X-Accel-Buffering':'no'});res.flushHeaders();}
          if(!closed)res.write('event: changed\ndata: {}\n\n');
        }while(again && !closed);
      }catch{close();}finally{checking=false;}
    };
    client.on('notification',event=>{if(event.payload===rideId)void check();});
    await check();if(closed)return;
    // Bound each stream's lifetime so the next connection revalidates/refreshes auth.
    expiry=setTimeout(close,55000);
    heartbeat=setInterval(()=>{if(!closed)res.write(': keepalive\n\n');},15000);
  }catch{if(!res.headersSent)res.status(503);close();}
}

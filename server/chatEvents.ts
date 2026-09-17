import pg from 'pg';
import type {Request,Response} from 'express';
import type {Pool} from 'pg';
const streams=new Map<string,number>();
let total=0;
// Both audiences share the same bounded LISTEN/SSE lifecycle. Only invalidations
// are emitted; clients refetch the API appropriate to that audience.
export function chatEvents(pool:Pool,req:Request,res:Response,userId:string,rideId:string){
  return events(pool,req,res,'user:'+userId,rideId,userId);
}
export function rideEvents(pool:Pool,req:Request,res:Response,rideId:string){
  return events(pool,req,res,'ip:'+(req.ip??req.socket.remoteAddress??'unknown'),rideId);
}
async function events(pool:Pool,req:Request,res:Response,limitKey:string,rideId:string,userId?:string){
  if(total>=100 || (streams.get(limitKey)??0)>=5){res.status(429).end();return;}
  total++;streams.set(limitKey,(streams.get(limitKey)??0)+1);
  const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  let closed=false,checking=false,again=false;
  let heartbeat:ReturnType<typeof setInterval>|undefined,expiry:ReturnType<typeof setTimeout>|undefined;
  const close=()=>{if(closed)return;closed=true;total--;const remaining=(streams.get(limitKey)??1)-1;if(remaining)streams.set(limitKey,remaining);else streams.delete(limitKey);clearInterval(heartbeat);clearTimeout(expiry);void client.end().catch(()=>{});res.end();};
  res.on('close',close);client.on('error',close);
  try{
    await client.connect();if(closed)return;
    await client.query(userId ? 'LISTEN ride_chat' : 'LISTEN ride_state');
    const check=async()=>{
      if(closed)return;if(checking){again=true;return;}checking=true;
      try{
        do {again=false;
          const member=userId
            ? await pool.query('SELECT 1 FROM ride_participants WHERE ride_id=$1 AND user_id=$2 AND left_at IS NULL',[rideId,userId])
            : await pool.query('SELECT 1 FROM rides WHERE id=$1',[rideId]);
          if(closed)return;
          if(!member.rowCount){if(!res.headersSent)res.status(userId?403:404);else res.write('event: forbidden\ndata: {}\n\n');close();return;}
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

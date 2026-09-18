import { Router } from 'express';
import { createPool } from './db';
import { publicProfiles } from './reputation';
import { AVATAR_LIMIT, validateAvatar } from './auth/avatar';

export function publicProfileRoutes() {
  const router=Router();
  const pool=process.env.DATABASE_URL?createPool():null;
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store'); if(!pool)return res.status(503).json({error:'Profiles are temporarily unavailable.'});next();});
  router.get('/:id',async(req,res)=>{
    const profile=(await publicProfiles(pool!,[String(req.params.id)]))[0];
    if(!profile)return res.status(404).json({error:'Profile not found.'});
    res.json(profile);
  });
  router.get('/:id/avatar',async(req,res)=>{
    const row=(await pool!.query('SELECT avatar_url FROM users WHERE id=$1',[req.params.id])).rows[0];
    if(!row?.avatar_url)return res.status(404).end();
    try {
      const url=new URL(row.avatar_url), base=new URL(process.env.SUPABASE_URL!);
      // Only our configured storage service; never follow redirects or proxy arbitrary URLs.
      if(url.origin!==base.origin || url.username || url.password || !url.pathname.startsWith('/storage/v1/object/public/avatars/'))return res.status(404).end();
      const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!response.ok || !response.body)throw new Error('Avatar unavailable');
      const type=response.headers.get('content-type')?.split(';')[0]??'';
      const reader=response.body.getReader(); const chunks:Buffer[]=[]; let size=0;
      try {
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>AVATAR_LIMIT)throw new Error('Avatar too large');chunks.push(Buffer.from(value));}
      } finally {await reader.cancel();}
      const body=Buffer.concat(chunks);validateAvatar(body,type);
      res.setHeader('X-Content-Type-Options','nosniff');res.type(type).send(body);
    } catch {res.status(503).end();}
  });
  return router;
}

import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import pg from 'pg';
import {rideRouteSnapshot} from '../server/routeSnapshots.ts';
const admin=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});
const name='eagleride_snapshots_'+randomUUID().replaceAll('-','');
let pool; const closed=[];
before(async()=>{
  assert.ok(process.env.TEST_DATABASE_URL,'Set TEST_DATABASE_URL');
  await admin.connect();await admin.query('CREATE DATABASE "'+name+'"');
  const url=new URL(process.env.TEST_DATABASE_URL);url.pathname='/'+name;
  pool=new pg.Pool({connectionString:url.toString()});
  pool.on('connect',client=>closed.push(new Promise(resolve=>client.once('end',resolve))));
  for(const file of (await readdir('server/migrations')).filter(f=>f.endsWith('.sql')).sort())await pool.query(await readFile('server/migrations/'+file,'utf8'));
});
after(async()=>{if(pool){await pool.end();await Promise.all(closed);await admin.query('DROP DATABASE "'+name+'"');}await admin.end();});
const departure=Date.now()+48*3600000;
async function ride(){
  return (await pool.query(`INSERT INTO rides(host_user_id,origin_name,destination_name,departure_at,seats_total,luggage_type,flexibility)
    VALUES('u1','Boston College','Newton Campus',$1,4,'ONE_SUITCASE','EXACT') RETURNING id`,[new Date(departure)])).rows[0].id;
}
function fixture(){
  let now=departure-48*3600000,calls=0,fail=false;
  const lookup=async()=>{calls++;if(fail)throw Error('Google unavailable');return {
    distanceMeters:3131,durationSeconds:393,trafficAwareDurationSeconds:330+calls,
    source:'google-routes',calculatedAt:new Date(now).toISOString(),departureTime:new Date(departure).toISOString(),timing:'scheduled'
  };};
  return {lookup,clock:()=>now,setHours:h=>now=departure-h*3600000,setFail:v=>fail=v,calls:()=>calls};
}
test('first open persists one shared snapshot; concurrent and repeated viewers reuse it',async()=>{
  const id=await ride(),f=fixture();
  const results=await Promise.all(Array.from({length:8},()=>rideRouteSnapshot(pool,id,f.lookup,f.clock)));
  assert.equal(f.calls(),1);for(const result of results)assert.deepEqual(result,results[0]);
  assert.equal((await pool.query('SELECT count(*) FROM ride_route_snapshots WHERE ride_id=$1',[id])).rows[0].count,'1');
  assert.deepEqual(await rideRouteSnapshot(pool,id,()=>assert.fail('persistent snapshot must survive a new service instance'),f.clock),results[0]);
});
test('6h/2h/1h milestones occur once; 24h is not a refresh and final hour is spaced by 20m',async()=>{
  const id=await ride(),f=fixture(),get=()=>rideRouteSnapshot(pool,id,f.lookup,f.clock);
  const initial=await get();
  for(const h of [30,24,12,6.001]){f.setHours(h);await get();}assert.equal(f.calls(),1);
  for(const [h,count] of [[6,2],[2,3],[1,4]]){
    f.setHours(h);const updated=await get();await get();assert.equal(f.calls(),count);
    assert.equal(updated.estimatedFareCents,initial.estimatedFareCents);
  }
  f.setHours(41/60);await get();assert.equal(f.calls(),4);
  f.setHours(40/60);await get();await get();assert.equal(f.calls(),5);
  f.setHours(20/60);await get();assert.equal(f.calls(),6);
  f.setHours(0);await get();assert.equal(f.calls(),6);
});
test('late first opens consume passed milestones without catch-up calls',async()=>{
  const id=await ride(),f=fixture();f.setHours(.5);
  await rideRouteSnapshot(pool,id,f.lookup,f.clock);await rideRouteSnapshot(pool,id,f.lookup,f.clock);assert.equal(f.calls(),1);
  f.setHours(11/60);await rideRouteSnapshot(pool,id,f.lookup,f.clock);assert.equal(f.calls(),1);
  f.setHours(10/60);await rideRouteSnapshot(pool,id,f.lookup,f.clock);assert.equal(f.calls(),2);
});
test('cancelled and past rides never fetch even without a snapshot',async()=>{
  const f=fixture(),cancelled=await ride(),past=await ride();
  await pool.query('UPDATE rides SET cancelled_at=now() WHERE id=$1',[cancelled]);
  assert.equal((await rideRouteSnapshot(pool,cancelled,f.lookup,f.clock)).data,null);
  f.setHours(-1);assert.equal((await rideRouteSnapshot(pool,past,f.lookup,f.clock)).data,null);
  assert.equal(f.calls(),0);
});
test('failed scheduled refresh preserves timestamped data and fare and records attempt',async()=>{
  const id=await ride(),f=fixture(),get=()=>rideRouteSnapshot(pool,id,f.lookup,f.clock);
  const initial=await get();f.setHours(6);f.setFail(true);
  const failed=await get();assert.equal(failed.latestRefreshFailed,true);
  assert.deepEqual(failed.data,initial.data);assert.equal(failed.estimatedFareCents,initial.estimatedFareCents);
  assert.notEqual(failed.lastAttemptAt,initial.lastAttemptAt);
  assert.deepEqual(await get(),failed);assert.equal(f.calls(),2);
  f.setHours(2);f.setFail(false);const recovered=await get();
  assert.equal(recovered.latestRefreshFailed,false);assert.equal(recovered.estimatedFareCents,initial.estimatedFareCents);
});
test('initial failure remains unavailable without repeated calls until next milestone',async()=>{
  const id=await ride(),f=fixture();f.setFail(true);
  const first=await rideRouteSnapshot(pool,id,f.lookup,f.clock);
  assert.equal(first.data,null);assert.equal(first.latestRefreshFailed,true);
  await rideRouteSnapshot(pool,id,f.lookup,f.clock);assert.equal(f.calls(),1);
  f.setHours(6);f.setFail(false);assert.ok((await rideRouteSnapshot(pool,id,f.lookup,f.clock)).data);
  assert.equal(f.calls(),2);
});
test('cancellation preserves a successful snapshot and failed final-hour attempts respect spacing',async()=>{
  const id=await ride(),f=fixture(),get=()=>rideRouteSnapshot(pool,id,f.lookup,f.clock);
  f.setHours(1);const initial=await get();
  f.setHours(40/60);f.setFail(true);const failed=await get();
  assert.deepEqual(failed.data,initial.data);assert.equal(failed.latestRefreshFailed,true);
  f.setHours(21/60);await get();assert.equal(f.calls(),2);
  await pool.query('UPDATE rides SET cancelled_at=now() WHERE id=$1',[id]);
  f.setHours(20/60);assert.deepEqual(await get(),failed);assert.equal(f.calls(),2);
});

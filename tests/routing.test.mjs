import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { once } from 'node:events';
import { createRoutingService, routingLimit, routeAddress } from '../server/routing.ts';
import { authErrors } from '../server/auth/routes.ts';
import { estimateRouteFare } from '../src/utils/priceEstimator.ts';
const input = { origin: { name: 'Boston College', address: null, terminal: null },
  destination: { name: 'Logan Airport (BOS)', address: null, terminal: 'C' } };
const raw = { routes: [{ distanceMeters: 16093, duration: '1800s', staticDuration: '1200s' }] };
const response = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
test('normalizes Google traffic-aware routes and sends only fixed provider fields', async () => {
  let request;
  const service = createRoutingService({ key: 'SECRET_TEST_KEY', fetcher: async (url, init) => { request = {url,...init}; return response(raw); } });
  const result = await service(input);
  assert.equal(result.distanceMeters,16093); assert.equal(result.durationSeconds,1200);
  assert.equal(result.trafficAwareDurationSeconds,1800); assert.equal(result.timing,'current');
  assert.equal(request.url,'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(request.headers['X-Goog-Api-Key'],'SECRET_TEST_KEY');
  assert.equal(JSON.parse(request.body).routingPreference,'TRAFFIC_AWARE');
  assert.match(JSON.parse(request.body).destination.address,/Terminal C/);
  assert.doesNotMatch(JSON.stringify(result),/SECRET|routes.googleapis|headers/);
  assert.equal(estimateRouteFare(result),3390);
  assert.equal(estimateRouteFare(null),null);
});
test('provider fallback is not represented as traffic-aware; scheduled timing is explicit', async () => {
  const service=createRoutingService({key:'key', fetcher: async()=>response({...raw,fallbackInfo:{routingMode:'FALLBACK_TRAFFIC_UNAWARE'}})});
  const result=await service({...input, departureTime:new Date(Date.now()+86400000).toISOString()});
  assert.equal(result.trafficAwareDurationSeconds,null); assert.equal(result.durationSeconds,1200);assert.equal(result.timing,'scheduled');
});
test('missing key, provider failures, empty/malformed routes and timeout fail without secrets', async () => {
  await assert.rejects(createRoutingService()(input),/unavailable/);
  for(const fetcher of [
    async()=>new Response('SECRET_TEST_KEY',{status:429}),
    async()=>{throw new Error('SECRET_TEST_KEY');},
    async()=>response({routes:[]}),
    async()=>response({routes:[{distanceMeters:1,duration:'1s'}]}),
    async()=>response({routes:[{distanceMeters:-1,duration:'abc'}]}),
    async()=>response({routes:[{distanceMeters:1,duration:'NaNs'}]}),
    async()=>response({routes:[{distanceMeters:1,duration:'1s',staticDuration:'bad'}]}),
    (_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('SECRET_TEST_KEY timeout')))),
  ]) {
    await assert.rejects(createRoutingService({key:'SECRET_TEST_KEY',fetcher,timeoutMs:10})(input),error=>{
      assert.equal(error.status,503); assert.doesNotMatch(error.message,/SECRET_TEST_KEY/); return true;
    });
  }
});
test('cache deduplicates concurrent lookups, expires, and does not cache failures', async () => {
  let calls=0, time=Date.now();
  const service=createRoutingService({key:'key',now:()=>time,fetcher:async()=>{calls++;return response(raw);}});
  const [a,b]=await Promise.all([service(input),service(input)]);
  assert.deepEqual(a,b);await service(input);assert.equal(calls,1);
  time+=61000;await service(input);assert.equal(calls,2);
  let failures=0;
  const bad=createRoutingService({key:'key',fetcher:async()=>{failures++;throw Error();}});
  await assert.rejects(bad(input));await assert.rejects(bad(input));assert.equal(failures,2);
});
test('locations preserve explicit addresses and reject ambiguous names without guessing categories', async () => {
  assert.equal(routeAddress({name:'My pickup',address:'123 Custom St, Cambridge, MA',terminal:null}),'My pickup, 123 Custom St, Cambridge, MA');
  assert.throws(()=>routeAddress({name:'near campus',address:null,terminal:null}),/complete address/);
  const service=createRoutingService({key:'key',fetcher:async()=>{assert.fail('must not call provider');}});
  await assert.rejects(service({...input,departureTime:'2000-01-01T00:00:00Z'}),/departure time/);
  await assert.rejects(service({...input,origin:{name:'Some Boston cafe',address:null,terminal:null}}),/complete address/);
});
test('snapshot rate limiter bounds requests without upstream access', async () => {
  const app=express();app.post('/snapshot',routingLimit(2),(_req,res)=>res.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port+'/snapshot';
  try {
    assert.equal((await fetch(url,{method:'POST'})).status,200);
    assert.equal((await fetch(url,{method:'POST'})).status,200);
    const limited=await fetch(url,{method:'POST'});
    assert.equal(limited.status,429);assert.ok(limited.headers.get('retry-after'));
  } finally {await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
});

test('immediate departure omits upstream timestamp and near-future scheduling preserves it exactly', async () => {
  const now = Date.parse('2026-09-13T12:00:00Z');
  const requests = [];
  const service = createRoutingService({ key: 'key', now: () => now, fetcher: async (_url, init) => {
    requests.push(JSON.parse(init.body)); return response(raw);
  } });
  const immediate = await service(input);
  assert.equal(Object.hasOwn(requests[0], 'departureTime'), false);
  assert.equal(requests[0].routingPreference, 'TRAFFIC_AWARE');
  assert.equal(immediate.timing, 'current');
  assert.equal(immediate.trafficAwareDurationSeconds, 1800);
  const departureTime = new Date(now + 30000).toISOString();
  const scheduled = await service({ ...input, departureTime });
  assert.equal(requests[1].departureTime, departureTime);
  assert.equal(requests[1].routingPreference, 'TRAFFIC_AWARE');
  assert.equal(scheduled.departureTime, departureTime);
  assert.equal(scheduled.timing, 'scheduled');
  assert.equal(scheduled.trafficAwareDurationSeconds, 1800);
});

test('route UI preserves failed-refresh data with timestamp and only shows unavailable without data',async()=>{
  const {createElement}=await import('react');
  const {renderToStaticMarkup}=await import('react-dom/server');
  const {default:RouteInfo,mapsRouteUrl}=await import('../src/components/RouteInfo.tsx');
  const mapsUrl=mapsRouteUrl({origin:{name:'Boston College'},destination:{name:'Newton Campus'}});
  assert.match(mapsUrl,/^https:\/\/www.google.com\/maps\/dir/);
  const html=renderToStaticMarkup(createElement(RouteInfo,{loading:false,latestRefreshFailed:true,mapsUrl,data:{
    distanceMeters:16093,durationSeconds:1200,trafficAwareDurationSeconds:1800,source:'google-routes',
    calculatedAt:'2026-09-01T12:00:00Z',departureTime:'2026-09-17T12:00:00Z',timing:'scheduled',
  }}));
  assert.match(html,/10.0 mi · 30 min driving/);assert.match(html,/Baseline driving ETA: 20 min/);assert.match(html,/Latest refresh failed/);
  assert.match(html,/not current\/live traffic/);assert.match(html,/Google Maps · Updated/);
  assert.doesNotMatch(html,/Live route information is unavailable/);
  const empty=renderToStaticMarkup(createElement(RouteInfo,{loading:false,latestRefreshFailed:true,mapsUrl,data:null}));
  assert.match(empty,/Live route information is unavailable/);
});

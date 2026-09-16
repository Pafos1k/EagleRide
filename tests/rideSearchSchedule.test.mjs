import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {localDay,dayAfter,searchWindow,timeWindows} from '../src/lib/rideSearchSchedule.ts';
import RideSearchSchedule from '../src/components/RideSearchSchedule.tsx';

test('quick dates advance calendar days across month and year boundaries',()=>{
  assert.equal(localDay(dayAfter(new Date(2026,8,30,12),1)),'2026-10-01');
  assert.equal(localDay(dayAfter(new Date(2026,11,31,12),2)),'2027-01-02');
});
test('presets preserve the existing inclusive-minute departure window contract',()=>{
  const now=new Date(2026,8,15,12),date='2026-09-16';
  for(const [name,[start,end]] of Object.entries(timeWindows)){
    const result=searchWindow(date,start,end,now);
    assert.equal(result.after,new Date(date+'T'+(start || '00:00')).toISOString(),name);
    const upper=new Date(date+'T'+(end || '00:00'));
    if(end)upper.setMinutes(upper.getMinutes()+1);else upper.setDate(upper.getDate()+1);
    assert.equal(result.before,upper.toISOString(),name);
  }
});
test('custom windows preserve exact selected minutes and reject past/invalid choices',()=>{
  const now=new Date(2026,8,15,12);
  const result=searchWindow('2026-09-16','10:15','11:45',now);
  assert.equal(result.after,new Date(2026,8,16,10,15).toISOString());
  assert.equal(result.before,new Date(2026,8,16,11,46).toISOString());
  assert.throws(()=>searchWindow('2026-09-14','','',now),/future date/);
  assert.throws(()=>searchWindow('2026-09-16','17:00','06:00',now),/increasing/);
  assert.throws(()=>searchWindow('2026-09-16','25:00','',now),/valid departure/);
  assert.throws(()=>searchWindow('2026-09-31','','',now),/increasing/);
});
test('whole-day windows follow local calendar boundaries across daylight saving',()=>{
  for(const date of ['2026-03-08','2026-11-01']){
    const result=searchWindow(date,'','',new Date(2026,0,1));
    const start=new Date(date+'T00:00'),end=dayAfter(start,1);
    assert.equal(result.after,start.toISOString());assert.equal(result.before,end.toISOString());
  }
});
test('normal search shows quick choices and hides native date/time inputs and custom picker',()=>{
  const html=renderToStaticMarkup(React.createElement(RideSearchSchedule,{value:{date:localDay(new Date()),earliest:'',latest:''},onChange:()=>{}}));
  for(const label of ['Today','Tomorrow','Choose date','Any time','Morning','Afternoon','Evening','Custom'])assert.ok(html.includes(label));
  assert.doesNotMatch(html,/<input|<select|role="dialog"/);
  assert.match(html,/aria-pressed="true"/);assert.match(html,/Entire selected day/);
});

test('initial search has no filter toggle or date/time controls and retains From/To',async()=>{
  const {buildRideSearch}=await import('../src/lib/rideSearchSchedule.ts');
  const fields={from:' Newton Campus ',to:'Logan Airport (BOS)',date:'2026-09-16',earliest:'',latest:'',periods:[],custom:false};
  assert.deepEqual(buildRideSearch(fields,false,false),{from:'Newton Campus',to:'Logan Airport (BOS)'});
  const {MemoryRouter}=await import('react-router-dom');const {default:FindRides}=await import('../views/FindRides.tsx');
  const {AuthProvider}=await import('../src/auth/AuthProvider.tsx');
  const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AuthProvider,null,React.createElement(FindRides))));
  assert.match(html,/Search rides/);assert.doesNotMatch(html,/Filters|aria-expanded|Choose date|Morning|Custom|Entire selected day/);
});
test('multi-select keeps disjoint windows, custom is exclusive, and summaries retain selection',async()=>{
  const {buildRideSearch,scheduleSummary}=await import('../src/lib/rideSearchSchedule.ts');
  const now=new Date(2026,8,15,12),value={from:'',to:'',date:'2026-09-16',earliest:'',latest:'',periods:['Morning','Evening'],custom:false};
  const query=buildRideSearch(value,true,false,now),windows=JSON.parse(query.windows);
  assert.equal(windows.length,2);assert.ok(Date.parse(windows[0].before)<Date.parse(windows[1].after));
  const afternoon=new Date(2026,8,16,14);assert.ok(!windows.some(w=>+afternoon>=Date.parse(w.after) && +afternoon<Date.parse(w.before)));
  assert.equal(scheduleSummary(value,now),'Tomorrow · Morning + Evening');
  for(const periods of [['Morning'],['Morning','Afternoon'],['Afternoon','Evening'],['Morning','Evening']])assert.equal(JSON.parse(buildRideSearch({...value,periods},true,false,now).windows).length,periods.length);
  const custom=buildRideSearch({...value,custom:true,periods:[],earliest:'09:00',latest:'10:30'},true,false,now);
  assert.ok(custom.after && custom.before);assert.equal(custom.windows,undefined);
  const any=buildRideSearch({...value,periods:[]},true,false,now);assert.equal(any.windows,undefined);
  assert.equal(any.after,new Date(2026,8,16).toISOString());
  const html=renderToStaticMarkup(React.createElement(RideSearchSchedule,{value,onChange:()=>{}}));
  assert.match(html,/Morning \+ Evening/);assert.doesNotMatch(html,/<select/);
});
test('campus configuration expands only recognized endpoint groups',async()=>{
  const {locationSearchTerms,recognizedCampus}=await import('../shared/campuses.ts');
  assert.equal(recognizedCampus('  NEWTON   CAMPUS ').campus.id,'newton');
  const exact=locationSearchTerms('Newton Campus');assert.ok(!exact.includes('boston college'));
  assert.ok(locationSearchTerms('Newton Campus',true).includes('boston college'));
  assert.ok(locationSearchTerms('Boston College Main Campus',true).includes('newton campus'));
  assert.deepEqual(locationSearchTerms('Logan Airport (BOS)',true),['logan airport (bos)']);
  assert.equal(recognizedCampus('Some Main Campus'),null);
});

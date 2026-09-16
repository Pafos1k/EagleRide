import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {hasValidSearchLocations,campusMatchNote} from '../src/lib/findRidePresentation.ts';
import FindRideCard from '../src/components/FindRideCard.tsx';
const ride={id:'ride',hostUserId:'host',origin:{name:'Boston College',address:'140 Commonwealth Ave, Chestnut Hill, MA',terminal:null},destination:{name:'Logan Airport (BOS)',address:null,terminal:'C'},departureTime:'2030-01-01T12:00:00Z',seatsTaken:1,seatsTotal:4,cancelledAt:null};
const render=(currentUserId,search={})=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(FindRideCard,{ride,currentUserId,search})));

test('date/time visibility requires two valid locations and handles clearing/invalid edits',()=>{
  for(const [from,to,expected] of [['','',false],['Newton Campus','',false],['Newton Campus','Logan Airport (BOS)',true],['Newton Campus','  ',false],['Newton Campus','x'.repeat(501),false],['','Logan Airport (BOS)',false],['  123 Custom Street  ','South Station',true]]){
    assert.equal(hasValidSearchLocations(from,to),expected);
  }
});
test('only hosted cards receive the darker thicker border and Your ride label',()=>{
  const owned=render('host');assert.match(owned,/Your ride/);assert.match(owned,/border-2 border-neutral-800/);assert.match(owned,/bg-white/);assert.match(owned,/hover:border-black/);
  for(const user of ['other',undefined]){
    const html=render(user);assert.doesNotMatch(html,/Your ride|border-2 border-neutral-800/);assert.match(html,/border border-neutral-200/);assert.match(html,/bg-white/);
  }
});
test('campus indicator only describes results added by flexible matching at the same endpoint',()=>{
  assert.equal(campusMatchNote(ride,{}),'');
  assert.equal(campusMatchNote(ride,{from:'Newton Campus'}),'');
  assert.equal(campusMatchNote(ride,{from:'Boston College Main Campus',nearbyCampuses:'true'}),'');
  assert.equal(campusMatchNote(ride,{from:'Newton Campus',nearbyCampuses:'true'}),'Nearby campus pickup: Boston College Main Campus');
  assert.equal(campusMatchNote(ride,{to:'Newton Campus',nearbyCampuses:'true'}),'');
  const reverse={...ride,origin:ride.destination,destination:ride.origin};
  assert.equal(campusMatchNote(reverse,{to:'Newton Campus',nearbyCampuses:'true'}),'Nearby campus destination: Boston College Main Campus');
  // A record already matching the exact endpoint must not get a flexibility badge.
  assert.equal(campusMatchNote({...ride,origin:{...ride.origin,address:'885 Centre St, Newton, MA'}},{from:'Newton Campus',nearbyCampuses:'true'}),'');
});
test('cards preserve actual locations without large campus headings; expanded matches get a small secondary indicator',()=>{
  const normal=render('other',{from:'Boston College',nearbyCampuses:'true'});
  assert.match(normal,/FROM: Boston College/);assert.match(normal,/Logan Airport \(BOS\) \(C\)/);assert.doesNotMatch(normal,/Pickup:|Dropoff:|Nearby campus/);
  const expanded=render('other',{from:'Newton Campus',nearbyCampuses:'true'});
  assert.match(expanded,/text-xs text-neutral-500">Nearby campus pickup:/);assert.match(expanded,/FROM: Boston College/);
});

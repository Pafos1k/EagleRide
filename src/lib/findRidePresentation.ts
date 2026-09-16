import {locationSearchTerms,normalizeLocation,recognizedCampus} from '../../shared/campuses';
import {rideSearchSchema} from '../../shared/rideSearch';
import type {PersistedRide} from '../../shared/rides';

// Search accepts free-text names/addresses, not only the suggestion list.
export function hasValidSearchLocations(from:string,to:string){
  return !!from.trim() && !!to.trim() && rideSearchSchema.safeParse({from,to}).success;
}
export function campusMatchNote(ride:PersistedRide,search:Record<string,string>){
  if(search.nearbyCampuses!=='true')return '';
  return (['from','to'] as const).flatMap(endpoint=>{
    const requested=search[endpoint];if(!requested)return [];
    const actual=endpoint==='from'?ride.origin:ride.destination;
    const found=recognizedCampus(actual.name) ?? recognizedCampus(actual.address ?? '');
    const wanted=recognizedCampus(requested);
    if(!found || !wanted || found.group.id!==wanted.group.id || found.campus.id===wanted.campus.id)return [];
    const exact=locationSearchTerms(requested) ?? [];
    if([actual.name,actual.address ?? ''].some(value=>exact.includes(normalizeLocation(value))))return [];
    return [`Nearby campus ${endpoint==='from'?'pickup':'destination'}: ${found.campus.label}`];
  }).join(' · ');
}

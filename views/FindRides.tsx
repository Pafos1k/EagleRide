
import React, { useState, useEffect } from 'react';
import { Filter } from 'lucide-react';
import RideSearchSchedule from '../src/components/RideSearchSchedule';
import {localDay,buildRideSearch,type SearchFields} from '../src/lib/rideSearchSchedule';
import {recognizedCampus,campusGroups} from '../shared/campuses';
import { listRides } from '../src/api/rides';
import { type PersistedRide } from '../shared/rides';

import FindRideCard from '../src/components/FindRideCard';
import {hasValidSearchLocations} from '../src/lib/findRidePresentation';
import {useAuth} from '../src/auth/AuthProvider';

const FindRides: React.FC = () => {
  const {user}=useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [rides, setRides] = useState<PersistedRide[]>([]);
  const emptyFields=():SearchFields=>({from:'',to:'',date:localDay(new Date()),earliest:'',latest:'',periods:[],custom:false});
  const [fields,setFields]=useState<SearchFields>(emptyFields);
  const [dateEnabled,setDateEnabled]=useState(false);
  const [nearby,setNearby]=useState(false);
  const locationsReady=hasValidSearchLocations(fields.from,fields.to);
  const hasCampus=!!(recognizedCampus(fields.from) || recognizedCampus(fields.to));
  const [search,setSearch]=useState<Record<string,string>>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    listRides(controller.signal,search).then(all => {
      const joinable = all.filter(r => !r.cancelledAt && Date.parse(r.departureTime) > Date.now() && r.seatsTaken < r.seatsTotal);
      setRides(joinable);
    }).catch(() => {
      if (!controller.signal.aborted) setError('Unable to load rides. Please try again.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [search, reload]);

  const applySearch=(value=fields,withDate=dateEnabled,withNearby=nearby)=>{
    const ready=hasValidSearchLocations(value.from,value.to);
    const includeCampuses=ready && withNearby && !!(recognizedCampus(value.from) || recognizedCampus(value.to));
    try {
      const query=buildRideSearch(value,ready && withDate,includeCampuses);
      setSearch(query);setNearby(includeCampuses);setError('');
    }catch(error){setError(error instanceof Error?error.message:'Choose a valid departure window.');}
  };
  const clearFilters=()=>{
    const next={...emptyFields(),from:fields.from,to:fields.to};
    setFields(next);setDateEnabled(false);setNearby(false);applySearch(next,false,false);
  };


  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-16 pb-16 sm:pb-24 space-y-8 sm:space-y-12">
      <div className="flex flex-col items-center text-center space-y-4 sm:space-y-6">
        <div className="space-y-1 sm:space-y-2">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tighter">Find a Ride</h1>
          <p className="text-sm sm:text-lg text-neutral-500 font-medium">Find a split for your trip and departure window.</p>
        </div>
        
        <form className="w-full space-y-3" onSubmit={event=>{
          event.preventDefault();applySearch();
        }}>
          <div className="grid sm:grid-cols-2 gap-3">{(['from','to'] as const).map(key=><label key={key} className="text-left text-sm">{key==='from'?'From':'To'}<input list="ride-locations" className="w-full bg-neutral-100 rounded-xl p-3 mt-1" value={fields[key]} onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>)}</div>
          <datalist id="ride-locations">{[...campusGroups.flatMap(group=>group.campuses.map(campus=>campus.aliases[0])),'Logan Airport (BOS)','South Station','177 Huntington Ave'].map(name=><option key={name} value={name}/>)}</datalist>
          {locationsReady && <div className="space-y-3">
            <RideSearchSchedule active={dateEnabled} value={fields} onChange={value=>{const next={...fields,...value};setFields(next);setDateEnabled(true);applySearch(next,true,nearby);}}/>
            {hasCampus && <label className="flex items-center gap-2 min-h-11 text-sm text-neutral-700 text-left"><input type="checkbox" checked={nearby} onChange={event=>{setNearby(event.target.checked);applySearch(fields,dateEnabled,event.target.checked);}} className="w-5 h-5 accent-black"/>Include nearby BC campuses</label>}
            {(dateEnabled || nearby) && <button type="button" className="min-h-11 px-2 underline text-sm text-neutral-500" onClick={clearFilters}>Clear options</button>}
          </div>}
          <button className="w-full bg-black text-white rounded-xl py-3 font-bold">Search rides</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        {loading ? <p role="status" className="text-center text-neutral-500">Loading rides...</p> : error ? (
          <div role="alert" className="text-center"><p>{error}</p><button className="mt-3 underline" onClick={() => setReload(value => value + 1)}>Retry</button></div>
        ) : rides.length > 0 ? (
          rides.map(ride => {
            return (
              <FindRideCard key={ride.id} ride={ride} currentUserId={user?.id} search={search}/>
            );
          })
        ) : (

          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-8 sm:p-12 md:p-20 text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Filter size={24} className="text-neutral-300" />
            </div>
            <h3 className="text-xl font-bold text-neutral-800">No Matches Found</h3>
            <p className="text-neutral-500 max-w-xs mx-auto mt-2 mb-8 text-sm">We couldn't find any rides for this destination. Try a broader search or offer your own ride!</p>
            <button 
              onClick={() => {setFields(emptyFields());setDateEnabled(false);setNearby(false);setSearch({});}}
              className="bg-black text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-neutral-800 transition-colors"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FindRides;

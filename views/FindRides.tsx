
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Filter, MapPin, ChevronRight } from 'lucide-react';
import RideSearchSchedule from '../src/components/RideSearchSchedule';
import {localDay,buildRideSearch,scheduleSummary,type SearchFields} from '../src/lib/rideSearchSchedule';
import {recognizedCampus,campusGroups} from '../shared/campuses';
import { listRides } from '../src/api/rides';
import { locationLabel, rideCategory, type PersistedRide } from '../shared/rides';

const FindRides: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [rides, setRides] = useState<PersistedRide[]>([]);
  const emptyFields=():SearchFields=>({from:'',to:'',date:localDay(new Date()),earliest:'',latest:'',periods:[],custom:false});
  const [fields,setFields]=useState<SearchFields>(emptyFields);
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [dateEnabled,setDateEnabled]=useState(false);
  const [nearby,setNearby]=useState(false);
  const [summary,setSummary]=useState('');
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
    const includeCampuses=withNearby && !!(recognizedCampus(value.from) || recognizedCampus(value.to));
    try {
      const query=buildRideSearch(value,withDate,includeCampuses);
      setSearch(query);setNearby(includeCampuses);setError('');
      setSummary([withDate?scheduleSummary(value):'',includeCampuses?'Nearby BC campuses':''].filter(Boolean).join(' · '));
    }catch(error){setError(error instanceof Error?error.message:'Choose a valid departure window.');}
  };
  const clearFilters=()=>{
    const next={...emptyFields(),from:fields.from,to:fields.to};
    setFields(next);setDateEnabled(false);setNearby(false);applySearch(next,false,false);
  };

  const formatDestinationName = (ride: PersistedRide) => locationLabel(ride.destination);

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
          <div className="flex flex-wrap items-center gap-2 text-sm text-left">
            <button type="button" aria-expanded={filtersOpen} aria-controls="ride-search-filters" className="min-h-11 inline-flex items-center gap-2 px-3 rounded-xl bg-neutral-100" onClick={()=>setFiltersOpen(!filtersOpen)}><Filter size={16}/>Filters</button>
            {!filtersOpen && summary && <span className="text-neutral-600 flex-1">{summary}</span>}
            {(summary || dateEnabled || nearby) && <button type="button" className="min-h-11 px-2 underline text-neutral-500" onClick={clearFilters}>Clear filters</button>}
          </div>
          {filtersOpen && <div id="ride-search-filters" className="space-y-3">
            <RideSearchSchedule active={dateEnabled} value={fields} onChange={value=>{const next={...fields,...value};setFields(next);setDateEnabled(true);applySearch(next,true,nearby);}}/>
            {hasCampus && <label className="flex items-center gap-2 min-h-11 text-sm text-neutral-700 text-left"><input type="checkbox" checked={nearby} onChange={event=>{setNearby(event.target.checked);applySearch(fields,dateEnabled,event.target.checked);}} className="w-5 h-5 accent-black"/>Include nearby BC campuses</label>}
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
              <Link key={ride.id} to={`/ride/${ride.id}`} className="group">
                <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:border-black transition-all">
                  
                  {(recognizedCampus(ride.origin.name) || recognizedCampus(ride.origin.address ?? '') || recognizedCampus(ride.destination.name) || recognizedCampus(ride.destination.address ?? '')) && <p className="px-3.5 sm:px-6 pt-3 text-sm font-semibold text-neutral-800 break-words">
                    {[['Pickup',ride.origin],['Dropoff',ride.destination]].map(([label,location])=>{
                      const place=location as PersistedRide['origin'];const campus=recognizedCampus(place.name) ?? recognizedCampus(place.address ?? '');
                      return campus?`${label}: ${campus.campus.label}`:null;
                    }).filter(Boolean).join(' · ')}
                  </p>}
                  {/* Top Section: Departure - Destination - People - Arrow */}
                  <div className="p-3.5 sm:p-6 flex items-center justify-between gap-2 sm:gap-4">
                    
                    {/* Left: Departure */}
                    <div className="w-16 sm:w-24 shrink-0">
                      <p className="font-mono text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5 sm:mb-1">Departure</p>
                      <div className="flex flex-col">
                        <span className="font-bold text-neutral-900 text-sm sm:text-lg leading-tight whitespace-nowrap">
                          {new Date(ride.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-bold text-neutral-400 text-[9px] sm:text-[10px] uppercase tracking-wider">
                          {new Date(ride.departureTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    {/* Center: Destination */}
                    <div className="flex-1 min-w-0 text-center px-1 sm:px-2">
                      <p className="font-mono text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5 sm:mb-1">Destination</p>
                      <p className="text-base sm:text-xl md:text-2xl font-bold text-neutral-900 tracking-tight leading-tight truncate">
                        {formatDestinationName(ride)}
                      </p>
                    </div>

                    {/* Right: People */}
                    <div className="w-14 sm:w-20 shrink-0 text-right">
                      <p className="font-mono text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5 sm:mb-1">People</p>
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-neutral-900 text-sm sm:text-lg leading-tight">
                          {ride.seatsTaken} / {ride.seatsTotal}
                        </span>
                        <span className="font-bold text-neutral-400 text-[9px] sm:text-[10px] uppercase tracking-wider">
                          {ride.cancelledAt ? 'Cancelled' : rideCategory(ride) === 'past' ? 'Past' : ride.seatsTaken >= ride.seatsTotal ? 'Full' : 'View / Join'}
                        </span>
                      </div>
                    </div>

                    {/* Far Right: Arrow */}
                    <div className="w-7 h-7 sm:w-10 sm:h-10 shrink-0 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-400 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
                      <ChevronRight size={14} className="sm:w-5 sm:h-5" />
                    </div>
                  </div>

                  {/* Bottom Section: Origin */}
                  <div className="bg-neutral-200 border-t border-neutral-300 py-1.5 sm:py-2 px-3 sm:px-6 flex items-center justify-center">
                    <div className="flex items-center text-neutral-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest truncate">
                      <MapPin size={10} className="mr-1 shrink-0" />
                      <span className="truncate">FROM: {locationLabel(ride.origin)}</span>
                    </div>
                  </div>

                </div>
              </Link>
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
              onClick={() => {setFields(emptyFields());setDateEnabled(false);setNearby(false);setSummary('');setFiltersOpen(false);setSearch({});}}
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

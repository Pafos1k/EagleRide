import {useEffect,useRef,useState} from 'react';
import {ApiError,getRide} from '../api/rides';
import type {PersistedRide} from '../../shared/rides';

export function useLiveRide(id:string|undefined,reload:number) {
  const [ride,setRide]=useState<PersistedRide|null>(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState('');
  const accept=useRef<(ride:PersistedRide)=>void>(()=>{});
  useEffect(()=>{
    const controller=new AbortController();
    let fetching=false,queued=false,version=0;
    setRide(null);setLoading(true);setError('');
    const apply=(value:PersistedRide)=>{if(!controller.signal.aborted){setRide(value);setError('');}};
    accept.current=value=>{if(value.id===id){
      apply(value);
      // A mutation response can itself trail another viewer's newer mutation.
      void refresh();
    }};
    const refresh=async()=>{
      if(controller.signal.aborted)return;
      version++;
      if(fetching){queued=true;return;}fetching=true;
      try {
        do {
          queued=false;const current=version;
          try {
            const value=await getRide(id??'',controller.signal);
            if(current===version)apply(value);
          } catch(error) {
            if(!controller.signal.aborted && current===version){
              if(error instanceof ApiError && error.status===404)setRide(null);
              setError(error instanceof ApiError && error.status===404?'Ride not found.':'Unable to load this ride. Please try again.');
            }
          }
        } while(queued&&!controller.signal.aborted);
      } finally {fetching=false;if(!controller.signal.aborted)setLoading(false);}
    };
    void refresh();
    const events=new EventSource('/api/rides/'+encodeURIComponent(id??'')+'/ride-events');
    // The server sends changed immediately after LISTEN on every connection,
    // including reconnects. This closes the initial read/subscribe gap as well.
    events.addEventListener('changed',()=>void refresh());
    events.addEventListener('forbidden',()=>{events.close();void refresh();});
    return()=>{controller.abort();events.close();accept.current=()=>{};};
  },[id,reload]);
  return {ride,loading,error,accept:(value:PersistedRide)=>accept.current(value)};
}

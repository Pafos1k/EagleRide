import React, {useState} from 'react';
export default function JourneyMap({src}:{src:string}){
  const [loadedSrc,setLoadedSrc]=useState<string|null>(null);
  const loading=loadedSrc!==src;
  return <div className="rounded-2xl border border-neutral-200 overflow-hidden h-60 sm:h-72 shadow-sm bg-neutral-50 relative" aria-busy={loading}>
    {loading && <div role="status" className="absolute inset-0 flex items-center justify-center bg-neutral-100 text-sm text-neutral-500 pointer-events-none">Loading map…</div>}
    <iframe key={src} width="100%" height="100%" frameBorder="0" style={{border:0}} src={src} allowFullScreen
      onLoad={()=>setLoadedSrc(src)} className={`w-full h-full ${loading?'opacity-0':'opacity-100'}`} title="Ride Route Map" />
  </div>;
}

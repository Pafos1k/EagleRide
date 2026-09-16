import React, {useEffect,useState} from 'react';
import type {RatingInput,RatingRecipient,RideRatings} from '../../shared/reputation';
import {getRideRatings,submitRating} from '../api/rides';

function Recipient({recipient,busy,onSubmit}:{recipient:RatingRecipient;busy:boolean;onSubmit:(input:RatingInput)=>void}) {
  const [issue,setIssue]=useState(false);
  const late=recipient.eligibility==='late_cancellation';
  const reasons=late?[['late_cancellation','Late cancellation']]:[['no_show','No-show'],['significantly_late','Significantly late']];
  return <div className="border-t border-neutral-200 pt-3 space-y-2">
    <p className="text-sm font-semibold">Was {recipient.profile.fullName} reliable for this ride?</p>
    {recipient.rating?<p className="text-sm text-neutral-500">Rated · {recipient.rating.outcome==='reliable'?'Reliable':recipient.rating.reason?.replaceAll('_',' ')}</p>:<>
      {late && <p className="text-xs text-neutral-500">Left within two hours of departure. Only late cancellation can be reported.</p>}
      <div className="flex flex-wrap gap-2">
        {!late && <button disabled={busy} className="rounded-lg border px-3 py-2 text-sm" onClick={()=>onSubmit({recipientUserId:recipient.profile.id,outcome:'reliable'})}>✓ Yes, showed up as agreed</button>}
        <button disabled={busy} aria-pressed={issue} className={`rounded-lg border px-3 py-2 text-sm ${issue?'bg-black text-white':''}`} onClick={()=>setIssue(!issue)}>⚠ There was an issue</button>
      </div>
      {issue && <div className="flex flex-wrap gap-2">{reasons.map(([reason,label])=><button key={reason} disabled={busy} className="text-sm rounded-lg bg-neutral-100 px-3 py-2" onClick={()=>onSubmit({recipientUserId:recipient.profile.id,outcome:'issue',reason:reason as 'no_show'|'significantly_late'|'late_cancellation'})}>{label}</button>)}</div>}
    </>}
  </div>;
}
export default function RateParticipants({rideId,remaining}:{rideId:string;remaining:number}) {
  const [open,setOpen]=useState(false),[state,setState]=useState<RideRatings>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!open)return;const controller=new AbortController();setError('');getRideRatings(rideId,controller.signal).then(setState).catch(error=>{if(!controller.signal.aborted)setError(error.message);});return()=>controller.abort();},[open,rideId]);
  const rated=state?state.recipients.every(p=>p.rating):remaining===0;
  return <div className="px-4 pb-3">
    <button className="text-sm font-semibold underline py-2" aria-expanded={open} onClick={()=>setOpen(!open)}>{rated?'Ratings submitted':'Rate participants'}</button>
    {open && <div className="space-y-3" aria-label="Rate participants">
      <p className="text-xs text-neutral-500">Share feedback within seven days of departure. Ratings cannot be changed.</p>
      {error && <p role="alert" className="text-sm">{error}</p>}
      {!state&&!error?<p role="status">Loading participants...</p>:state?.canRate?state.recipients.map(recipient=><Recipient key={recipient.profile.id} recipient={recipient} busy={busy} onSubmit={async input=>{
        setBusy(true);setError('');try{setState(await submitRating(rideId,input));}catch(error){setError(error instanceof Error?error.message:'Unable to save rating.');}finally{setBusy(false);}
      }}/>):<p className="text-sm">This ride is no longer open for ratings.</p>}
    </div>}
  </div>;
}

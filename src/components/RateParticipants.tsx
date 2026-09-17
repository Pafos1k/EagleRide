import {MessagesSquare} from 'lucide-react';
import React, {useEffect,useState,useRef} from 'react';
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
export default function RateParticipants({rideId}:{rideId:string}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [state,setState]=useState<RideRatings>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{const controller=new AbortController();getRideRatings(rideId,controller.signal).then(value=>{if(!controller.signal.aborted)setState(value);}).catch(error=>{if(!controller.signal.aborted){if(error.status===403)setState({canRate:false,recipients:[]});else setError(error.message);}});return()=>controller.abort();},[rideId]);
  const recipients=state?.recipients ?? [];
  const pending=recipients.filter(p=>!p.rating);
  if(!state?.canRate || !pending.length)return null;
  const label=recipients.length>1?'Rate riders':'Rate rider';
  return <>
    <div data-rating-action className="relative z-10 col-start-3 row-start-1 flex justify-end">
      <button className="inline-flex h-[34px] sm:h-[38px] sm:w-[140px] max-w-full items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-black bg-white text-black px-3 text-xs lg:text-sm font-bold transition-colors hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" aria-label={label} onClick={()=>dialog.current?.showModal()}><MessagesSquare size={16} className="w-3.5 h-3.5 lg:w-4 lg:h-4" aria-hidden="true" /><span className="sm:hidden">Rate</span><span className="hidden sm:inline">{label}</span></button>
    </div>
    <dialog ref={dialog} className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl p-5 backdrop:bg-black/30" aria-label="Rate participants">
      <div className="space-y-3">
        <div className="flex justify-between items-center"><h2 className="font-semibold">Rate riders</h2><button className="text-sm px-3 py-2" onClick={()=>dialog.current?.close()}>Close</button></div>
        {error && <p role="alert" className="text-sm">{error}<button className="underline ml-2" onClick={()=>{setError('');getRideRatings(rideId).then(setState).catch(e=>setError(e.message));}}>Retry</button></p>}
        {recipients.map(recipient=><Recipient key={recipient.profile.id} recipient={recipient} busy={busy||!state?.canRate} onSubmit={async input=>{
          setBusy(true);setError('');try{const updated=await submitRating(rideId,input);setState(updated);if(updated.recipients.every(p=>p.rating))dialog.current?.close();}catch(error){setError(error instanceof Error?error.message:'Unable to save rating.');}finally{setBusy(false);}
        }}/>)}
      </div>
    </dialog>
  </>;
}

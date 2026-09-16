import React from 'react';
import type { Reputation } from '../../shared/reputation';
export default function ReputationSummary({reputation,compact=false}:{reputation:Reputation;compact?:boolean}) {
  const label=reputation.reliabilityPercent===null?'New rider':`${reputation.reliabilityPercent}% ${compact?'reliable':'Reliable'}`;
  const rides=`${reputation.rideCount} ${reputation.rideCount===1?'ride':'rides'}`;
  return compact?<p className="text-xs text-neutral-500">{label} · {rides}</p>:<section aria-label="Rider reliability" className="text-center py-2">
    <p className="font-semibold">{label}</p><p className="text-sm text-neutral-500">{rides} · {reputation.ratingCount} {reputation.ratingCount===1?'rating':'ratings'}</p>
    <p className="text-xs text-neutral-400 mt-1">Based on rider feedback, not verified attendance.</p>
  </section>;
}

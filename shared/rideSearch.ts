import {z} from 'zod';
const windowSchema=z.object({after:z.iso.datetime({offset:true}),before:z.iso.datetime({offset:true})}).strict().refine(q=>Date.parse(q.after)<Date.parse(q.before),'Choose an increasing departure window.');
export const rideSearchSchema=z.object({
  from:z.string().trim().max(500).optional(),to:z.string().trim().max(500).optional(),
  after:z.iso.datetime({offset:true}).optional(),before:z.iso.datetime({offset:true}).optional(),
  nearbyCampuses:z.enum(['true','false']).optional(),
  windows:z.string().max(1000).transform((value,context)=>{try{return JSON.parse(value);}catch{context.addIssue({code:'custom',message:'Invalid departure windows.'});return z.NEVER;}}).pipe(z.array(windowSchema).min(1).max(3)).optional(),
}).strict().refine(q=>!q.after || !q.before || Date.parse(q.after)<Date.parse(q.before),'Choose an increasing departure window.')
.refine(q=>!q.windows || (!q.after && !q.before),'Use either a single window or multiple windows.');
export type RideSearch=z.infer<typeof rideSearchSchema>;

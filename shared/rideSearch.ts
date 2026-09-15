import {z} from 'zod';
export const rideSearchSchema=z.object({
  from:z.string().trim().max(500).optional(),to:z.string().trim().max(500).optional(),
  after:z.iso.datetime({offset:true}).optional(),before:z.iso.datetime({offset:true}).optional(),
}).strict().refine(q=>!q.after || !q.before || Date.parse(q.after)<Date.parse(q.before),'Choose an increasing departure window.');
export type RideSearch=z.infer<typeof rideSearchSchema>;

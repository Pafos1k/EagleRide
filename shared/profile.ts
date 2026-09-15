import { z } from 'zod';
export const profileInput = z.object({
  fullName: z.string().trim().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f<>]/.test(value), 'Use a plain-text name.'),
}).strict();

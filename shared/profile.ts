import { z } from 'zod';
export const profileInput = z.object({
  fullName: z.string().trim().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f<>]/.test(value), 'Use a plain-text name.'),
  avatarUrl: z.string().trim().max(2048).url().refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch { return false; }
  }, 'Use an HTTPS image URL without credentials.').nullable(),
}).strict();

import { AuthFailure } from './provider';
export const AVATAR_LIMIT = 2 * 1024 * 1024;
export function validateAvatar(body: unknown, type: string): asserts body is Buffer {
  if (!Buffer.isBuffer(body) || !body.length || body.length > AVATAR_LIMIT) throw new AuthFailure(400, 'Choose an image up to 2 MB.');
  const png = type === 'image/png' && body.length >= 24 && body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && body.toString('ascii',12,16) === 'IHDR';
  const jpeg = type === 'image/jpeg' && body.length >= 4 && body[0] === 255 && body[1] === 216 && body[2] === 255 && body[body.length-2] === 255 && body[body.length-1] === 217;
  const webp = type === 'image/webp' && body.length >= 16 && body.toString('ascii',0,4) === 'RIFF' && body.toString('ascii',8,12) === 'WEBP';
  if (!png && !jpeg && !webp) throw new AuthFailure(400, 'Choose a PNG, JPEG, or WebP image.');
}

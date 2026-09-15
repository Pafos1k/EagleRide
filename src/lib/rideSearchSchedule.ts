export const localDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export const dayAfter = (date: Date, offset: number) => { const next=new Date(date); next.setDate(next.getDate()+offset); return next; };
export const timeWindows = {
  'Any time': ['', ''], Morning: ['06:00','12:00'], Afternoon: ['12:00','17:00'], Evening: ['17:00','23:59'],
} as const;
export type TimePreset = keyof typeof timeWindows | 'Custom';
// Preserve the existing API's inclusive selected minute / exclusive upper bound.
export function searchWindow(date:string, earliest:string, latest:string, now=new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < localDay(now)) throw new Error('Choose today or a future date.');
  if ([earliest,latest].some(time=>time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error('Choose a valid departure time.');
  const start=new Date(date+'T'+(earliest || '00:00'));
  const end=new Date(date+'T'+(latest || '00:00'));
  if (!latest) end.setDate(end.getDate()+1); else end.setMinutes(end.getMinutes()+1);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || localDay(start)!==date || end<=start) throw new Error('Choose an increasing departure window.');
  return {after:start.toISOString(),before:end.toISOString()};
}
export const timeLabel=(time:string)=>{ const [hour,minute]=time.split(':').map(Number);return `${hour%12 || 12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'}`; };

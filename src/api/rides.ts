import type { ActivityRide, CreateRideInput, PersistedRide } from '../../shared/rides';
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(body?.error ?? 'Unable to load rides. Please try again.', response.status);
  }
  return response.json();
}
export const listRides = (signal?: AbortSignal, search: Record<string,string> = {}) => request<PersistedRide[]>('/api/rides' + (Object.keys(search).length ? '?' + new URLSearchParams(search) : ''), { signal });
export const getRide = (id: string, signal?: AbortSignal) => request<PersistedRide>(`/api/rides/${encodeURIComponent(id)}`, { signal });
export const createRide = (input: CreateRideInput) => request<PersistedRide>('/api/rides', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
});

export const myRides = (signal?: AbortSignal) => request<ActivityRide[]>('/api/rides/mine', { signal, cache: 'no-store' });
export const operateRide = (id: string, operation: 'join' | 'leave' | 'cancel') =>
  request<PersistedRide>(`/api/rides/${encodeURIComponent(id)}/${operation}`, { method: 'POST' });

export const getChat = (id: string, signal?: AbortSignal) => request<import('../../shared/messages').RideChat>(
  '/api/rides/' + encodeURIComponent(id) + '/messages', { signal, cache: 'no-store' });
export const sendMessage = (id: string, body: string, clientMessageId?: string) => request<import('../../shared/messages').RideChat>(
  '/api/rides/' + encodeURIComponent(id) + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body, clientMessageId }) });

export const deleteMessage=(rideId:string,id:string)=>request<import('../../shared/messages').RideChat>(`/api/rides/${rideId}/messages/${id}`,{method:'DELETE'});
export const reactMessage=(rideId:string,id:string,emoji:string,remove:boolean)=>request<import('../../shared/messages').RideChat>(`/api/rides/${rideId}/messages/${id}/reactions`,{method:remove?'DELETE':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({emoji})});

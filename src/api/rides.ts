import type { CreateRideInput, PersistedRide } from '../../shared/rides';
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
export const listRides = (signal?: AbortSignal) => request<PersistedRide[]>('/api/rides', { signal });
export const getRide = (id: string, signal?: AbortSignal) => request<PersistedRide>(`/api/rides/${encodeURIComponent(id)}`, { signal });
export const createRide = (input: CreateRideInput) => request<PersistedRide>('/api/rides', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
});

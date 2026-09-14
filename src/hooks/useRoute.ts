import { useEffect, useState } from 'react';
import type { RouteSnapshot } from '../../shared/routing';
export function useRoute(rideId: string | undefined) {
  const [state, setState] = useState<{ id: string; snapshot: RouteSnapshot | null; loading: boolean }>({ id: '', snapshot: null, loading: false });
  useEffect(() => {
    if (!rideId) return;
    const controller = new AbortController();
    setState({ id: rideId, snapshot: null, loading: true });
    fetch('/api/rides/' + encodeURIComponent(rideId) + '/route-snapshot', { method: 'POST', signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Unavailable');
        return response.json() as Promise<RouteSnapshot>;
      }).then(snapshot => { if (!controller.signal.aborted) setState({ id: rideId, snapshot, loading: false }); })
      .catch(() => { if (!controller.signal.aborted) setState({ id: rideId, snapshot: null, loading: false }); });
    return () => controller.abort();
  }, [rideId]);
  const snapshot = state.id === rideId ? state.snapshot : null;
  return { data: snapshot?.data ?? null, estimatedFareCents: snapshot?.estimatedFareCents ?? null,
    latestRefreshFailed: snapshot?.latestRefreshFailed ?? false,
    loading: !!rideId && (state.id !== rideId || state.loading) };
}

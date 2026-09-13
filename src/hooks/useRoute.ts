import { useEffect, useState } from 'react';
import type { RouteInput, RouteResult } from '../../shared/routing';
export function useRoute(input: RouteInput | null) {
  const key = input ? JSON.stringify(input) : '';
  const [state, setState] = useState<{ key: string; data: RouteResult | null; loading: boolean }>({ key: '', data: null, loading: false });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    setState({ key, data: null, loading: true });
    const timer = setTimeout(() => {
      fetch('/api/routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: key, signal: controller.signal })
        .then(async response => {
          if (!response.ok) throw new Error('Unavailable');
          return response.json() as Promise<RouteResult>;
        }).then(data => { if (!controller.signal.aborted) setState({ key, data, loading: false }); })
        .catch(() => { if (!controller.signal.aborted) setState({ key, data: null, loading: false }); });
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [key]);
  return { data: state.key === key ? state.data : null, loading: !!key && (state.key !== key || state.loading) };
}

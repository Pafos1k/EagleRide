import React from 'react';
import type { RouteInput, RouteResult } from '../../shared/routing';
export function mapsRouteUrl(input: RouteInput) {
  const label = (location: RouteInput['origin']) => [location.name, location.terminal ? 'Terminal ' + location.terminal : '', location.address].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(label(input.origin)) + '&destination=' + encodeURIComponent(label(input.destination));
}
export default function RouteInfo({ data, loading, mapsUrl, latestRefreshFailed = false }: { latestRefreshFailed?: boolean; data: RouteResult | null; loading: boolean; mapsUrl: string }) {
  return <p className="text-xs text-neutral-500 text-center">
    {data ? <>Updated <time dateTime={data.calculatedAt}>{new Date(data.calculatedAt).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}</time></> : loading ? 'Updating…' : 'Not updated'}
    {' · '}<a className="underline" target="_blank" rel="noopener noreferrer" href={mapsUrl}>Check live route</a>
  </p>;
}

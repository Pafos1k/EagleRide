import React from 'react';
import type { RouteInput, RouteResult } from '../../shared/routing';
export function mapsRouteUrl(input: RouteInput) {
  const label = (location: RouteInput['origin']) => [location.name, location.terminal ? 'Terminal ' + location.terminal : '', location.address].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(label(input.origin)) + '&destination=' + encodeURIComponent(label(input.destination));
}
export default function RouteInfo({ data, loading, mapsUrl, latestRefreshFailed = false }: { latestRefreshFailed?: boolean; data: RouteResult | null; loading: boolean; mapsUrl: string }) {
  return <div className="text-xs text-neutral-500 space-y-1 my-3">
    {loading ? <p role="status">Loading route information...</p> : data ? <>
      <p>{(data.distanceMeters / 1609.344).toFixed(1)} mi · {Math.ceil((data.trafficAwareDurationSeconds ?? data.durationSeconds) / 60)} min driving</p>
      <p>{data.trafficAwareDurationSeconds !== null ? 'Stored traffic-aware driving estimate' : 'Driving estimate · traffic unavailable'}
        {data.timing === 'scheduled' ? ' for ' + new Date(data.departureTime).toLocaleString() : ' for departure at ' + new Date(data.departureTime).toLocaleString()}</p>
      <p>Baseline driving ETA: {Math.ceil(data.durationSeconds / 60)} min</p>
      {latestRefreshFailed && <p role="status">Latest refresh failed. Showing the last successful snapshot; this is not current/live traffic.</p>}
      <p>Google Maps · Updated {new Date(data.calculatedAt).toLocaleString()}</p>
    </> : <p>Live route information is unavailable.</p>}
    <a className="underline" target="_blank" rel="noopener noreferrer" href={mapsUrl}>Check live route in Google Maps</a>
  </div>;
}

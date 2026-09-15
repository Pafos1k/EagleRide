import React, { useState } from 'react';
export default function UserAvatar({ name, url, className = 'w-8 h-8' }: { name: string; url?: string | null; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className={`${className} shrink-0 rounded-full overflow-hidden inline-flex items-center justify-center bg-neutral-200 text-neutral-800 font-bold`}>
    {url && failed !== url ? <img src={url} alt={`${name}'s avatar`} referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={() => setFailed(url)} /> : <span aria-label={`${name}'s avatar`}>{name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join('')}</span>}
  </span>;
}

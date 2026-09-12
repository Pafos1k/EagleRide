import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { myRides } from '../src/api/rides';
import { useAuth } from '../src/auth/AuthProvider';
import { locationLabel, type ActivityRide } from '../shared/rides';

export default function Dashboard() {
  const { user } = useAuth();
  const [rides, setRides] = useState<ActivityRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setRides([]);
    myRides(controller.signal).then(setRides).catch(() => {
      if (!controller.signal.aborted) setError('Unable to load Activity. Please try again.');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [user?.id, reload]);
  return <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
    <h1 className="text-3xl font-bold">Activity</h1>
    <p className="text-neutral-500">Your hosted and joined rides, including membership history.</p>
    <button className="underline" onClick={() => setReload(v => v + 1)}>Refresh Activity</button>
    {loading ? <p role="status">Loading Activity...</p> : error ? <p role="alert">{error}</p> :
      (['upcoming', 'past', 'cancelled'] as const).map(category => <section key={category} className="space-y-4">
        <h2 className="text-xl font-bold capitalize">{category[0].toUpperCase() + category.slice(1)}</h2>
        {rides.filter(ride => ride.category === category).length === 0 && <p className="text-neutral-500">No {category} rides.</p>}
        {rides.filter(ride => ride.category === category).map(ride => <Link key={ride.id} to={'/ride/' + ride.id} className="block rounded-2xl border border-neutral-200 bg-white p-5 space-y-2">
          <p className="font-bold">{locationLabel(ride.origin)} → {locationLabel(ride.destination)}</p>
          <p className="text-sm text-neutral-500">{new Date(ride.departureTime).toLocaleString()}</p>
          <p className="text-sm font-semibold">{ride.role === 'host' ? 'Hosted by you' : ride.membership === 'left' ? 'You left this ride' : 'Joined'} · {ride.cancelledAt ? 'Cancelled' : ride.seatsTaken + ' / ' + ride.seatsTotal + ' seats occupied'}</p>
        </Link>)}
      </section>)}
  </div>;
}

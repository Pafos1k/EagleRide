import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ChevronRight, MapPin, Search } from 'lucide-react';
import { myRides } from '../src/api/rides';
import { useAuth } from '../src/auth/AuthProvider';
import { locationLabel, rideCategory, type ActivityRide } from '../shared/rides';

export default function Dashboard() {
  const { user } = useAuth();
  const [rides, setRides] = useState<ActivityRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let controller: AbortController;
    const load = () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      setLoading(true); setError('');
      myRides(current.signal).then(all => {
        if (!current.signal.aborted) setRides(all);
      }).catch(() => {
        if (!current.signal.aborted) setError('Unable to load Activity. Please try again.');
      }).finally(() => { if (!current.signal.aborted) setLoading(false); });
    };
    setRides([]);
    load();
    // A cancellation in another tab must be reflected when Activity is revisited.
    window.addEventListener('focus', load);
    return () => { controller.abort(); window.removeEventListener('focus', load); };
  }, [user?.id, reload]);

  const owned = rides.filter(ride => user && (ride.hostUserId === user.id ||
    ride.participants.some(p => p.userId === user.id && !p.leftAt)));
  // Cancellation always wins, even if a previously fetched category is stale.
  const upcoming = owned.filter(ride => rideCategory(ride) === 'upcoming');
  const groups = [
    { title: 'Upcoming Journeys', rides: upcoming, empty: 'No Active Rides' },
    { title: 'Past', rides: owned.filter(ride => rideCategory(ride) === 'past'), empty: 'No past rides.' },
    { title: 'Cancelled', rides: owned.filter(ride => rideCategory(ride) === 'cancelled'), empty: 'No cancelled rides.' },
  ];

  return <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
    <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight">Ready to fly, {user?.fullName.split(/\s+/)[0]}?</h1>
        <p className="text-neutral-500 font-medium text-sm sm:text-base mt-1">You have {loading ? '…' : upcoming.length} journeys planned.</p>
      </div>
      <div className="bg-white border border-neutral-200 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-sm flex items-center space-x-3 w-fit">
        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-neutral-100 rounded-xl flex items-center justify-center shrink-0">
          <AlertCircle size={18} className="text-neutral-400 sm:w-5 sm:h-5" />
        </div>
        <div>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Upcoming Journeys</p>
          <p className="text-base sm:text-lg font-bold text-neutral-800 leading-tight">{loading ? '…' : upcoming.length}</p>
        </div>
      </div>
    </header>
    <button className="text-xs font-bold text-neutral-500 hover:text-black underline" onClick={() => setReload(v => v + 1)}>Refresh Activity</button>
    {loading ? <p role="status">Loading Activity...</p> : error ? <p role="alert">{error}</p> : groups.map((group, index) =>
      <section key={group.title} aria-label={group.title}>
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-neutral-800 tracking-tight">{group.title}</h2>
          {index === 0 && <Link to="/find" className="text-black text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center hover:underline group">Find More <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" /></Link>}
        </div>
        {group.rides.length ? <div className="grid grid-cols-1 gap-3 sm:gap-4">{group.rides.map(ride =>
          <Link key={ride.id} to={'/ride/' + ride.id} className="group">
            <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-6 hover:border-black transition-all flex items-center gap-3 sm:gap-6">
              <div className="w-18 sm:w-24 shrink-0 flex flex-col justify-center">
                <span className="font-bold text-neutral-900 text-base sm:text-xl leading-tight whitespace-nowrap">{new Date(ride.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="font-bold text-neutral-400 text-[10px] sm:text-xs uppercase tracking-wider mt-0.5">{new Date(ride.departureTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center border-l border-neutral-100 pl-3 sm:pl-6">
                <h3 className="text-base sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight truncate">{locationLabel(ride.destination)}</h3>
                <div className="flex items-center text-neutral-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest mt-1 truncate">
                  <MapPin size={10} className="mr-1 shrink-0" /><span className="truncate">From {locationLabel(ride.origin)}</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">{ride.hostUserId === user?.id ? 'Hosted by you' : 'Joined'}</p>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                <span className="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded uppercase tracking-wider bg-neutral-100 text-neutral-600">{ride.cancelledAt ? 'Cancelled' : index === 1 ? 'Past' : ride.seatsTaken + '/' + ride.seatsTotal}</span>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-400 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
                  <ChevronRight size={14} className="sm:w-4 sm:h-4" />
                </div>
              </div>
            </div>
          </Link>)}</div> : index === 0 ?
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl sm:rounded-[2.5rem] p-8 sm:p-12 md:p-16 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6"><Search size={28} className="text-slate-300 sm:w-8 sm:h-8" /></div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 uppercase italic">No Active Rides</h3>
            <p className="text-slate-500 max-w-xs mx-auto mt-2 mb-6 sm:mb-8 font-medium italic text-sm sm:text-base">Planning a trip home? Find a ride with fellow Eagles.</p>
            <Link to="/find" className="bg-bc-maroon text-white px-6 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:shadow-2xl hover:shadow-bc-maroon/30 transition-all inline-block">Find Rides</Link>
          </div> : <p className="text-neutral-500">{group.empty}</p>}
      </section>)}
  </div>;
}

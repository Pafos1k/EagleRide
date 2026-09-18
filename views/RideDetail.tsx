import {useLiveRide} from '../src/hooks/useLiveRide';
import ReputationSummary from '../src/components/ReputationSummary';
import UserAvatar from '../src/components/UserAvatar';
import JourneyMap from '../src/components/JourneyMap';
import { useRoute } from '../src/hooks/useRoute';
import RouteInfo from '../src/components/RouteInfo';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Users, 
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  MessageCircle,
  Navigation,
  ExternalLink,
  Sparkles,
  Map as MapIcon,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../src/auth/AuthProvider';
import { getRide, operateRide, ApiError } from '../src/api/rides';
import { locationLabel, rideCategory, type PersistedRide } from '../shared/rides';
import { signInPath } from '../shared/authReturn';

const RideDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [reload, setReload] = useState(0);
  
  const {ride,loading,error,accept}=useLiveRide(id,reload);
  const participants=ride?.participants.filter(p=>!p.leftAt)??[];
  const isJoined=participants.some(p=>p.userId===user?.id);
  const [selectedSplitCount, setSelectedSplitCount] = useState<number | null>(null);
  useEffect(()=>setSelectedSplitCount(null),[id,reload,user?.id]);


  async function act(operation: 'join' | 'leave' | 'cancel') {
    if (!user) { navigate(signInPath('/ride/' + id + '?action=join')); return; }
    setBusy(true); setActionError('');
    try {
      const updated = await operateRide(id!, operation);
      accept(updated);
      setSelectedSplitCount(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) navigate(signInPath('/ride/' + id));
      else {
        setActionError(error instanceof Error ? error.message : 'Unable to update ride.');
        // Another participant may have taken the last seat; refresh the displayed count.
        try { const latest = await getRide(id!); accept(latest); } catch { /* Preserve the actionable error. */ }
      }
    } finally { setBusy(false); }
  }

  const routing = useRoute(ride?.id);
  if (loading || !ride) {
    return <div className="max-w-4xl mx-auto py-16 px-4 text-center">
      <p role={loading ? 'status' : 'alert'} className="text-neutral-500 font-medium">{loading ? 'Loading ride details...' : error}</p>
      {!loading && <><button className="m-3 underline" onClick={() => setReload(value => value + 1)}>Retry</button><Link className="underline" to="/find">Find Rides</Link></>}
    </div>;
  }

  const actualGroupCount = Math.max(1, participants.length > 0 ? participants.length : (ride.seatsTaken || 1));
  const activeSplitCount = selectedSplitCount ?? actualGroupCount;
  const routeFare = routing.estimatedFareCents;
  const totalCost = routeFare === null ? null : routeFare / 100;

  const costPerPerson = totalCost === null ? null : +(totalCost / activeSplitCount).toFixed(2);
  const nextSplitCount = Math.min(ride.seatsTotal, actualGroupCount + 1);
  const nextCostPerPerson = totalCost === null ? null : +(totalCost / nextSplitCount).toFixed(2);
  const savingsPerPerson = totalCost === null || costPerPerson === null ? null : +(totalCost - costPerPerson).toFixed(2);

  const originTitle = locationLabel(ride.origin);
  const originAddress = ride.origin.address ?? '';
  const originQuery = `${originTitle}, ${originAddress}`;
  const destinationQuery = `${locationLabel(ride.destination)}, ${ride.destination.address ?? ''}`;
  const mapsEmbedUrl = `https://maps.google.com/maps?saddr=${encodeURIComponent(originQuery)}&daddr=${encodeURIComponent(destinationQuery)}&output=embed`;
  const externalMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originQuery)}&destination=${encodeURIComponent(destinationQuery)}&travelmode=driving`;

  const departureDate = new Date(ride.departureTime);
  const formattedDate = departureDate.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
  const formattedTime = departureDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  });

  const isHost = ride.hostUserId === user?.id;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pt-6 sm:pt-8 pb-12 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center text-neutral-500 hover:text-black transition-colors font-semibold text-sm sm:text-base">
          <ArrowLeft size={18} className="mr-2 sm:w-5 sm:h-5" /> Back to Search
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm">
            <div className="flex justify-between items-start mb-6 sm:mb-8 gap-4">
              <div className="min-w-0">
                <span className="bg-neutral-100 text-neutral-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 sm:mb-3 inline-block">
                  {locationLabel(ride.origin)} Pickup
                </span>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-neutral-900 tracking-tight">
                  To {locationLabel(ride.destination)}
                </h1>
                <p className="text-neutral-500 font-medium text-xs sm:text-sm mt-1.5 flex items-center">
                  <MapPin size={14} className="mr-1.5 text-neutral-400 shrink-0" />
                  <span className="truncate">{ride.destination.address}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Status</p>
                <p className={`font-bold text-xs sm:text-sm mt-1 text-neutral-900`}>{rideCategory(ride).toUpperCase()}</p>
              </div>
            </div>

            <div className="flex mb-6 sm:mb-8 border-t border-neutral-100 pt-6 sm:pt-8">
              <div className="flex items-center space-x-3 sm:space-x-4">
                <div className="w-10 h-10 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400 shrink-0">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Departure</p>
                  <p className="text-xs sm:text-sm font-bold text-neutral-800">
                    {formattedDate} at <span className="text-black">{formattedTime}</span>
                  </p>
                </div>
              </div>

            </div>

            {/* JOURNEY MAP */}
            <div className="space-y-3">
              <h2 className="text-base sm:text-lg font-bold text-neutral-800 text-center">Journey Map</h2>
              <RouteInfo {...routing} mapsUrl={externalMapsUrl} />

              <JourneyMap src={mapsEmbedUrl} />
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm">
            <h2 className="text-base sm:text-lg font-bold text-neutral-800 mb-4 sm:mb-6 flex items-center">
              <Users size={20} className="mr-2.5 sm:mr-3 text-neutral-400" /> Group Members ({participants.length}/{ride.seatsTotal})
            </h2>
            <div className="space-y-3">
              {participants.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                  <div className="flex items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                    <Link className="shrink-0" to={p.userId===user?.id?'/profile':'/profile/'+encodeURIComponent(p.userId)} aria-label={`View ${p.profile?.fullName??'rider'} profile`}>
                      <UserAvatar name={p.profile?.fullName??'Rider'} url={p.profile?.avatarUrl} className="w-10 h-10" />
                    </Link>
                    <div className="min-w-0">
                      <p className="font-bold text-neutral-800 text-sm [overflow-wrap:anywhere]">
                        <Link to={p.userId===user?.id?'/profile':'/profile/'+encodeURIComponent(p.userId)} className="hover:underline">{p.userId===user?.id?'You':p.profile?.fullName??'Eagle Participant'}</Link>
                        {p.userId===ride.hostUserId && <span className="ml-2 text-[10px] bg-black text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Host</span>}
                      </p>
                      {p.profile && <ReputationSummary reputation={p.profile.reputation} compact />}
                      <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Joined {new Date(p.joinedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-wider shrink-0 ml-2">
                    <span className="flex items-center space-x-1 text-emerald-600"><CheckCircle2 size={12} /><span>Joined</span></span>
                  </div>
                </div>
              ))}
              
              {[...Array(Math.max(0, ride.seatsTotal - participants.length))].map((_, i) => (
                <div key={i} className="flex items-center space-x-4 p-4 border border-dashed border-neutral-200 rounded-xl text-neutral-300">
                  <div className="w-10 h-10 border border-dashed border-neutral-200 rounded-full flex items-center justify-center">
                    <Users size={18} />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider">Empty Spot</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-5 shadow-sm lg:sticky lg:top-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-neutral-400">Approximate fare</span>
              <span className="text-xs font-semibold text-neutral-500">{totalCost === null ? 'Unavailable' : 'Total $' + totalCost.toFixed(2)}</span>
            </div>

            <p className="text-xs text-neutral-500 mb-3">Estimate only, not a live Uber/Lyft quote; tolls and fees may vary.</p>
            {/* Price display */}
            <div className="mb-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-black tracking-tight">{costPerPerson === null ? 'Unavailable' : '$' + costPerPerson.toFixed(2)}</span>
                <span className="text-xs sm:text-sm font-semibold text-neutral-400">/ person</span>
              </div>
              {activeSplitCount > 1 && savingsPerPerson !== null ? (
                <p className="text-xs font-semibold text-emerald-600 mt-1">
                  Save ${savingsPerPerson.toFixed(2)} vs solo
                </p>
              ) : (
                <p className="text-xs font-semibold text-neutral-400 mt-1">
                  {activeSplitCount === 1 ? 'Solo ride' : activeSplitCount + ' riders'}
                </p>
              )}
            </div>

            {/* Hypothetical fare splits cannot exceed this ride's capacity. */}
            <div className="bg-neutral-100 p-1 rounded-xl grid grid-cols-4 gap-1 mb-4">
              {Array.from({ length: ride.seatsTotal }, (_, i) => i + 1).map(count => {
                const isSelected = count === activeSplitCount;
                const perPerson = totalCost === null ? '—' : '$' + (totalCost / count).toFixed(2);
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setSelectedSplitCount(count)}
                    className={`py-2 px-1 rounded-lg text-center transition-all cursor-pointer select-none ${
                      isSelected
                        ? 'bg-black text-white shadow-sm'
                        : 'text-neutral-600 hover:text-black hover:bg-neutral-200/50'
                    }`}
                  >
                    <div className="text-[10px] sm:text-[11px] font-bold leading-tight">
                      {count} {count === 1 ? 'rider' : 'riders'}
                    </div>
                    <div className={`text-xs sm:text-sm font-black mt-0.5 ${isSelected ? 'text-white' : 'text-black'}`}>
                      {perPerson}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Trip Specs */}
            <div className="space-y-2 py-3 border-t border-neutral-100 text-xs mb-4">
              <div className="flex justify-between items-center text-neutral-500">
                <span>Group</span>
                <span className="font-semibold text-black">{actualGroupCount} of {ride.seatsTotal} joined</span>
              </div>
            </div>

            {actionError && <p role="alert" className="text-red-700 mb-3">{actionError}</p>}
            {user && (isHost || isJoined) && <Link to={'/chat/' + ride.id} className="flex w-full items-center justify-center gap-2 rounded-xl py-3 px-4 bg-black text-white font-bold mb-3"><MessageCircle size={18} />{ride.cancelledAt ? 'View chat history' : 'Open ride chat'}</Link>}
            {ride.cancelledAt ? <p className="font-bold text-red-700">Cancelled — this ride cannot be joined.</p> : <>
              {isHost ? <><p className="text-sm mb-3 text-center">You are hosting this ride.</p>{rideCategory(ride)!=='past' && <button disabled={busy} onClick={() => void act('cancel')} className="w-full rounded-xl py-3 bg-red-50 text-red-700 font-bold">Cancel ride</button>}</>
                : isJoined ? <button disabled={busy} onClick={() => void act('leave')} className="w-full py-2 text-sm underline text-neutral-600">Leave ride</button>
                : <button disabled={busy || rideCategory(ride) === 'past' || ride.seatsTaken >= ride.seatsTotal} onClick={() => void act('join')} className="w-full rounded-xl py-3 bg-black text-white font-bold disabled:opacity-50">{rideCategory(ride) === 'past' ? 'Departed' : ride.seatsTaken >= ride.seatsTotal ? 'Ride full' : user ? 'Join ride' : 'Sign in to join'}</button>}
            </>}

          </div>
        </div>
      </div>
      <footer className="text-xs text-neutral-500 text-center max-w-3xl mx-auto px-4 pt-8 pb-8 leading-relaxed">
        EagleRide is a ride-coordination platform, not a transportation provider. Rides are arranged between users and are not guaranteed. Drivers may cancel, arrive late, or fail to appear. Route, travel-time, and cost estimates are informational only and may change. Do not rely on EagleRide for time-critical transportation, including flights or other scheduled departures. Users are responsible for confirming ride arrangements, costs, timing, and personal safety.
      </footer>
    </div>
  );
};

export default RideDetail;

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  MapPin, 
  Clock, 
  Users, 
  Briefcase, 
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
import { useMockStore, CURRENT_USER } from '../store';
import { Ride, RideParticipant, ParticipantStatusType, RideStatusType, PickupZoneType } from '../types';
import { getLocationGuidance, LocationGuidance } from '../geminiService';
import { getFareBreakdown, estimateRideCost } from '../src/utils/priceEstimator';

const RideDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRides, getParticipants, saveParticipants, saveRides } = useMockStore();
  
  const [ride, setRide] = useState<Ride | null>(null);
  const [participants, setParticipants] = useState<RideParticipant[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [selectedSplitCount, setSelectedSplitCount] = useState<number | null>(null);

  useEffect(() => {
    const r = getRides().find((r: Ride) => r.id === id);
    if (r) {
      setRide(r);
      const ps = getParticipants().filter((p: RideParticipant) => p.rideId === id);
      setParticipants(ps);
      
      const userPart = ps.find((p: RideParticipant) => p.userId === CURRENT_USER.id);
      setIsJoined(!!userPart && userPart.status !== ParticipantStatusType.CANCELLED);
    }
  }, [id]);

  const handleJoin = () => {
    if (!ride) return;
    const newPart: RideParticipant = {
      id: `p-${Math.random().toString(36).substr(2, 9)}`,
      rideId: ride.id,
      userId: CURRENT_USER.id,
      status: ParticipantStatusType.ACCEPTED,
      joinedAt: new Date().toISOString()
    };
    
    // Update ride in store
    const allRides = getRides();
    const updatedRides = allRides.map((r: Ride) => 
      r.id === ride.id ? { ...r, seatsTaken: r.seatsTaken + 1, chatStatus: 'ACTIVE' } : r
    );
    saveRides(updatedRides);

    const allParts = [...getParticipants(), newPart];
    saveParticipants(allParts);
    setIsJoined(true);
    setParticipants([...participants, newPart]);
    setRide({ ...ride, seatsTaken: ride.seatsTaken + 1, chatStatus: 'ACTIVE' } as Ride);
  };

  if (!ride) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-black mb-4"></div>
        <p className="text-neutral-500 font-medium">Loading ride details...</p>
      </div>
    );
  }

  const actualGroupCount = Math.max(1, participants.length > 0 ? participants.length : (ride.seatsTaken || 1));
  const activeSplitCount = selectedSplitCount ?? actualGroupCount;
  const breakdown = getFareBreakdown(
    ride.destination,
    ride.departureTime,
    ride.pickupZone,
    activeSplitCount,
    ride.terminal
  );
  const totalCost = breakdown.totalEstimatedCost;

  const costPerPerson = +(totalCost / activeSplitCount).toFixed(2);
  const nextSplitCount = Math.min(ride.seatsTotal, actualGroupCount + 1);
  const nextCostPerPerson = +(totalCost / nextSplitCount).toFixed(2);
  const savingsPerPerson = +(totalCost - costPerPerson).toFixed(2);

  const isNewton = (ride.pickupZone as string) === 'NEWTON';
  const isOffCampus = (ride.pickupZone as string) === 'OFF_CAMPUS';
  const originTitle = isNewton 
    ? 'Boston College (Newton Campus)' 
    : isOffCampus 
    ? 'Off-Campus Location' 
    : 'Boston College (Main Campus)';

  const originAddress = isNewton
    ? '885 Centre St, Newton, MA'
    : isOffCampus
    ? 'Chestnut Hill, MA'
    : '140 Commonwealth Ave, Chestnut Hill, MA';

  const formatDestinationName = (dest: string) => {
    if (dest === 'LOGAN') return 'Logan Airport';
    if (dest === 'HUNTINGTON_177') return '177 Huntington';
    return dest.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  const originQuery = `${originTitle}, ${originAddress}`;
  const destinationQuery = `${formatDestinationName(ride.destination)}${ride.terminal ? ` Terminal ${ride.terminal}` : ''}, ${ride.destinationAddress}`;
  const mapsEmbedUrl = `https://maps.google.com/maps?saddr=${encodeURIComponent(originQuery)}&daddr=${encodeURIComponent(destinationQuery)}&output=embed`;
  const externalMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originQuery)}&destination=${encodeURIComponent(destinationQuery)}&travelmode=driving`;

  const departureDate = new Date(ride.departureTime);
  const formattedDate = departureDate.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
  const formattedTime = departureDate.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit'
  });

  const isHost = ride.hostUserId === CURRENT_USER.id;

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this ride?')) {
      // Get fresh data
      const allRides = getRides();
      const allParticipants = getParticipants();
      
      // Filter out
      const updatedRides = allRides.filter((r: Ride) => r.id !== ride.id);
      const updatedParticipants = allParticipants.filter((p: RideParticipant) => p.rideId !== ride.id);
      
      // Save
      saveRides(updatedRides);
      saveParticipants(updatedParticipants);
      
      // Notify other components in the same window
      window.dispatchEvent(new Event('storage'));
      
      // Navigate back
      navigate('/dashboard');
    }
  };

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
                  {ride.pickupZone.replace('_', ' ')} Pickup
                </span>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-neutral-900 tracking-tight">
                  {ride.pickupZone === 'OFF_CAMPUS' && ride.terminal ? 'From' : 'To'} {formatDestinationName(ride.destination)} {ride.terminal && `(${ride.terminal})`}
                </h1>
                <p className="text-neutral-500 font-medium text-xs sm:text-sm mt-1.5 flex items-center">
                  <MapPin size={14} className="mr-1.5 text-neutral-400 shrink-0" />
                  <span className="truncate">{ride.destinationAddress}</span>
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Status</p>
                <p className={`font-bold text-xs sm:text-sm mt-1 ${ride.status === RideStatusType.CONFIRMED ? 'text-emerald-500' : 'text-neutral-900'}`}>{ride.status}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8 mb-6 sm:mb-8 border-t border-neutral-100 pt-6 sm:pt-8">
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

              <div className="flex items-center space-x-3 sm:space-x-4">
                <div className="w-10 h-10 bg-neutral-50 rounded-xl flex items-center justify-center text-neutral-400 shrink-0">
                  <Briefcase size={20} />
                </div>
                <div>
                  <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Luggage</p>
                  <p className="text-xs sm:text-sm font-bold text-neutral-800 capitalize">
                    {ride.luggageType.toLowerCase().replace('_', ' ')}
                  </p>
                </div>
              </div>
            </div>

            {/* JOURNEY MAP */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-neutral-800">Journey Map</h2>
                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-neutral-600 bg-neutral-100 px-2.5 py-1 rounded-lg">
                    <span>{breakdown.distanceMiles} mi</span>
                    <span className="text-neutral-300">·</span>
                    <span>{breakdown.durationLabel}</span>
                  </div>
                  <a
                    href={externalMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-neutral-100 text-neutral-800 font-bold rounded-lg border border-neutral-200 shadow-sm transition-colors text-xs active:scale-95"
                  >
                    <Navigation size={12} className="text-neutral-600" />
                    <span>Open in Maps</span>
                    <ExternalLink size={11} className="text-neutral-400" />
                  </a>
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-200 overflow-hidden h-60 sm:h-72 shadow-sm bg-neutral-50 relative">
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  style={{ border: 0 }}
                  src={mapsEmbedUrl}
                  allowFullScreen
                  className="w-full h-full"
                  title="Ride Route Map"
                ></iframe>
              </div>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm">
            <h2 className="text-base sm:text-lg font-bold text-neutral-800 mb-4 sm:mb-6 flex items-center">
              <Users size={20} className="mr-2.5 sm:mr-3 text-neutral-400" /> Group Members ({participants.length}/{ride.seatsTotal})
            </h2>
            <div className="space-y-3">
              {participants.map((p, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border border-neutral-100">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-neutral-200 rounded-full flex items-center justify-center text-neutral-600 font-bold text-sm">
                      {p.userId === ride.hostUserId ? 'H' : 'P'}
                    </div>
                    <div>
                      <p className="font-bold text-neutral-800 text-sm">
                        {p.userId === CURRENT_USER.id ? 'You' : `Eagle Participant`}
                        {p.userId === ride.hostUserId && <span className="ml-2 text-[10px] bg-black text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Host</span>}
                      </p>
                      <p className="text-[10px] text-neutral-400 font-medium uppercase tracking-wider">Joined {new Date(p.joinedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 text-[10px] font-bold uppercase tracking-wider">
                    {p.status === ParticipantStatusType.ACCEPTED || p.status === ParticipantStatusType.CONFIRMED ? (
                      <span className="flex items-center space-x-1 text-emerald-600">
                        <CheckCircle2 size={12} />
                        <span>{p.status}</span>
                      </span>
                    ) : (
                      <span className="text-neutral-500">{p.status}</span>
                    )}
                  </div>
                </div>
              ))}
              
              {[...Array(ride.seatsTotal - participants.length)].map((_, i) => (
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
              <span className="text-xs font-black uppercase tracking-wider text-neutral-400">Fare</span>
              <span className="text-xs font-semibold text-neutral-500">Total ${totalCost.toFixed(2)}</span>
            </div>

            {/* Price display */}
            <div className="mb-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl sm:text-4xl font-black text-black tracking-tight">${costPerPerson.toFixed(2)}</span>
                <span className="text-xs sm:text-sm font-semibold text-neutral-400">/ person</span>
              </div>
              {activeSplitCount > 1 ? (
                <p className="text-xs font-semibold text-emerald-600 mt-1">
                  Save ${savingsPerPerson.toFixed(2)} vs solo
                </p>
              ) : (
                <p className="text-xs font-semibold text-neutral-400 mt-1">
                  Solo ride
                </p>
              )}
            </div>

            {/* Uber-style 4-segment rider split selector */}
            <div className="bg-neutral-100 p-1 rounded-xl grid grid-cols-4 gap-1 mb-4">
              {[1, 2, 3, 4].map(count => {
                const isSelected = count === activeSplitCount;
                const perPerson = (totalCost / count).toFixed(2);
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
                      ${perPerson}
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
              <div className="flex justify-between items-center text-neutral-500">
                <span>Trip</span>
                <span className="font-semibold text-black">{breakdown.distanceMiles} mi · ~{breakdown.durationLabel}</span>
              </div>
              {breakdown.multiplier > 1.0 && (
                <div className="flex justify-between items-center text-amber-800">
                  <span>Surge</span>
                  <span className="font-bold">{breakdown.multiplier}x</span>
                </div>
              )}
            </div>

            {/* Action button */}
            {!isJoined ? (
              <button 
                onClick={handleJoin}
                className="w-full bg-black text-white font-bold py-3.5 rounded-xl hover:bg-neutral-800 transition-all flex items-center justify-center text-sm cursor-pointer active:scale-[0.99]"
              >
                <span>Join Ride</span>
                <ChevronRight className="ml-1" size={16} />
              </button>
            ) : (
              <Link 
                to={`/chat/${ride.id}`}
                className="w-full flex items-center justify-center py-3.5 rounded-xl font-bold transition-all bg-black text-white hover:bg-neutral-800 text-sm"
              >
                <MessageCircle size={16} className="mr-2" /> Open Chat
              </Link>
            )}

            {isHost && (
              <div className="mt-3 text-center">
                <button 
                  onClick={handleDelete}
                  className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                >
                  Delete Ride
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RideDetail;

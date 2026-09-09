
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  ArrowRight, 
  MapPin, 
  Clock, 
  Users, 
  Sparkles,
  AlertCircle,
  Search,
  ChevronRight,
  Circle,
  Square,
  Trash2
} from 'lucide-react';
import { useMockStore, CURRENT_USER } from '../store';
import { Ride, RideStatusType } from '../types';
import { getSmartRideRecommendations } from '../geminiService';

const Dashboard: React.FC = () => {
  const { getRides, getParticipants, saveRides, saveParticipants } = useMockStore();
  const [activeRides, setActiveRides] = useState<Ride[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isLoadingRecs, setIsLoadingRecs] = useState(false);

  const formatDestinationName = (ride: Ride) => {
    const dest = ride.destination;
    let name = '';
    if (dest === 'LOGAN') name = 'Logan Airport';
    else if (dest === 'HUNTINGTON_177') name = '177 Huntington';
    else name = dest.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

    if (dest === 'LOGAN' && ride.terminal) {
      return `${name} (${ride.terminal})`;
    }
    return name;
  };

  const handleDelete = (e: React.MouseEvent, rideId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this ride?')) {
      const allRides = getRides();
      const updatedRides = allRides.filter((r: Ride) => r.id !== rideId);
      saveRides(updatedRides);
      
      const allParticipants = getParticipants();
      const updatedParticipants = allParticipants.filter((p: any) => p.rideId !== rideId);
      saveParticipants(updatedParticipants);
      
      // Trigger storage event for other components
      window.dispatchEvent(new Event('storage'));
      
      // Manually trigger local update if needed, but storage event should handle it
      // if the listener is set up correctly.
    }
  };

  useEffect(() => {
    const fetchData = () => {
      const rides = getRides();
      const participants = getParticipants();
      const userRideIds = participants
        .filter((p: any) => p.userId === CURRENT_USER.id && p.status !== 'CANCELLED')
        .map((p: any) => p.rideId);
      
      const filteredRides = rides.filter((r: Ride) => userRideIds.includes(r.id));
      
      // Sort by departure time ascending (nearest first)
      filteredRides.sort((a: Ride, b: Ride) => {
        const timeA = a.departureTime ? new Date(a.departureTime).getTime() : 0;
        const timeB = b.departureTime ? new Date(b.departureTime).getTime() : 0;
        
        if (isNaN(timeA)) return 1;
        if (isNaN(timeB)) return -1;
        
        return timeA - timeB;
      });
      
      setActiveRides(filteredRides);

      const fetchRecs = async () => {
        setIsLoadingRecs(true);
        const available = rides.filter((r: Ride) => r.status === RideStatusType.OPEN && !userRideIds.includes(r.id));
        const result = await getSmartRideRecommendations(
          JSON.stringify(CURRENT_USER),
          JSON.stringify(available)
        );
        setRecommendations(result.recommendations || []);
        setIsLoadingRecs(false);
      };

      fetchRecs();
    };

    fetchData();
    window.addEventListener('storage', fetchData);
    return () => window.removeEventListener('storage', fetchData);
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900 tracking-tight">Ready to fly, Baldwin?</h1>
          <p className="text-neutral-500 font-medium text-sm sm:text-base mt-1">You have {activeRides.length} journeys planned.</p>
        </div>
        <div className="bg-white border border-neutral-200 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-sm flex items-center space-x-3 w-fit">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-neutral-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertCircle size={18} className="text-neutral-400 sm:w-5 sm:h-5" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Reliability Score</p>
            <p className="text-base sm:text-lg font-bold text-neutral-800 leading-tight">{CURRENT_USER.reliabilityScore}</p>
          </div>
        </div>
      </header>

      {/* Active Rides Section */}
      <section>
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-neutral-800 tracking-tight">Upcoming Journeys</h2>
          <Link to="/find" className="text-black text-xs sm:text-sm font-bold uppercase tracking-wider flex items-center hover:underline group">
            Find More <ChevronRight size={16} className="ml-1 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {activeRides.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:gap-4">
            {activeRides.map(ride => (
              <Link key={ride.id} to={`/ride/${ride.id}`} className="group">
                <div className="bg-white border border-neutral-200 rounded-2xl p-4 sm:p-6 hover:border-black transition-all flex items-center gap-3 sm:gap-6">
                  
                  {/* Left: Departure Time & Date */}
                  <div className="w-18 sm:w-24 shrink-0 flex flex-col justify-center">
                    <span className="font-bold text-neutral-900 text-base sm:text-xl leading-tight whitespace-nowrap">
                      {new Date(ride.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-bold text-neutral-400 text-[10px] sm:text-xs uppercase tracking-wider mt-0.5">
                      {new Date(ride.departureTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>

                  {/* Middle: Destination & Origin */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center border-l border-neutral-100 pl-3 sm:pl-6">
                    <h3 className="text-base sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight truncate">
                      {formatDestinationName(ride)}
                    </h3>
                    <div className="flex items-center text-neutral-400 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest mt-1 truncate">
                      <MapPin size={10} className="mr-1 shrink-0" />
                      <span className="truncate">From {ride.pickupZone.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')}</span>
                    </div>
                  </div>

                  {/* Right: Status, Arrow */}
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    <span className={`text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded uppercase tracking-wider ${
                      ride.status === RideStatusType.CONFIRMED ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-100 text-neutral-600'
                    }`}>
                      {ride.status}
                    </span>

                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-400 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
                      <ChevronRight size={14} className="sm:w-4 sm:h-4" />
                    </div>
                  </div>

                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl sm:rounded-[2.5rem] p-8 sm:p-12 md:p-16 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <Search size={28} className="text-slate-300 sm:w-8 sm:h-8" />
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-800 uppercase italic">No Active Rides</h3>
            <p className="text-slate-500 max-w-xs mx-auto mt-2 mb-6 sm:mb-8 font-medium italic text-sm sm:text-base">Planning a trip home? Don't pay the full fare alone. Book a ride with fellow Eagles.</p>
            <Link to="/find" className="bg-bc-maroon text-white px-6 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:shadow-2xl hover:shadow-bc-maroon/30 transition-all inline-block">
              Request a Ride
            </Link>
          </div>
        )}
      </section>
    </div>
  );
};

export default Dashboard;

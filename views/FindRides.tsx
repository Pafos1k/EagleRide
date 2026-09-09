
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Filter, 
  MapPin, 
  Calendar, 
  Users, 
  Search,
  ChevronDown,
  Circle,
  Square,
  ChevronRight,
  Clock
} from 'lucide-react';
import { useMockStore, CURRENT_USER } from '../store';
import { Ride, DestinationType, RideStatusType } from '../types';

const FindRides: React.FC = () => {
  const { getRides } = useMockStore();
  const [rides, setRides] = useState<Ride[]>([]);
  const [filterDestination, setFilterDestination] = useState<string>('ALL');

  useEffect(() => {
    const fetchRides = () => {
      const allRides = getRides();
      let results = allRides.filter((r: Ride) => r.status === RideStatusType.OPEN);
      
      // Sort by departure time ascending (nearest first)
      results.sort((a, b) => {
        const timeA = a.departureTime ? new Date(a.departureTime).getTime() : 0;
        const timeB = b.departureTime ? new Date(b.departureTime).getTime() : 0;
        
        if (isNaN(timeA)) return 1;
        if (isNaN(timeB)) return -1;
        
        return timeA - timeB;
      });

      if (filterDestination !== 'ALL') {
        results = results.filter((r: Ride) => r.destination === filterDestination);
      }
      
      setRides(results);
    };

    fetchRides();
    window.addEventListener('storage', fetchRides);
    return () => window.removeEventListener('storage', fetchRides);
  }, [filterDestination]);

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

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-16 pb-16 sm:pb-24 space-y-8 sm:space-y-12">
      <div className="flex flex-col items-center text-center space-y-4 sm:space-y-6">
        <div className="space-y-1 sm:space-y-2">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-neutral-900 tracking-tighter">Find a Ride</h1>
          <p className="text-sm sm:text-lg text-neutral-500 font-medium">Select your destination to see available splits.</p>
        </div>
        
        <div className="bg-neutral-100 p-1 rounded-xl flex items-center w-full max-w-md border border-neutral-200">
          <Search size={18} className="text-neutral-400 ml-3 shrink-0" />
          <select 
            className="appearance-none bg-transparent px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold text-neutral-700 focus:outline-none cursor-pointer flex-1 min-w-0"
            value={filterDestination}
            onChange={(e) => setFilterDestination(e.target.value)}
          >
            <option value="ALL">All Destinations</option>
            <option value={DestinationType.LOGAN}>Logan Airport</option>
            <option value={DestinationType.SOUTH_STATION}>South Station</option>
            <option value={DestinationType.HUNTINGTON_177}>177 Huntington</option>
            <option value={DestinationType.BOSTON_COLLEGE}>Boston College</option>
            <option value={DestinationType.NEWTON_CAMPUS}>Newton Campus</option>
          </select>
          <ChevronDown size={14} className="text-neutral-400 mr-2 shrink-0" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4">
        {rides.length > 0 ? (
          rides.map(ride => {
            return (
              <Link key={ride.id} to={`/ride/${ride.id}`} className="group">
                <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:border-black transition-all">
                  
                  {/* Top Section: Departure - Destination - People - Arrow */}
                  <div className="p-3.5 sm:p-6 flex items-center justify-between gap-2 sm:gap-4">
                    
                    {/* Left: Departure */}
                    <div className="w-16 sm:w-24 shrink-0">
                      <p className="font-mono text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5 sm:mb-1">Departure</p>
                      <div className="flex flex-col">
                        <span className="font-bold text-neutral-900 text-sm sm:text-lg leading-tight whitespace-nowrap">
                          {new Date(ride.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="font-bold text-neutral-400 text-[9px] sm:text-[10px] uppercase tracking-wider">
                          {new Date(ride.departureTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    {/* Center: Destination */}
                    <div className="flex-1 min-w-0 text-center px-1 sm:px-2">
                      <p className="font-mono text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5 sm:mb-1">Destination</p>
                      <p className="text-base sm:text-xl md:text-2xl font-bold text-neutral-900 tracking-tight leading-tight truncate">
                        {formatDestinationName(ride)}
                      </p>
                    </div>

                    {/* Right: People */}
                    <div className="w-14 sm:w-20 shrink-0 text-right">
                      <p className="font-mono text-[9px] sm:text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-0.5 sm:mb-1">People</p>
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-neutral-900 text-sm sm:text-lg leading-tight">
                          {ride.seatsTaken} / {ride.seatsTotal}
                        </span>
                        <span className="font-bold text-neutral-400 text-[9px] sm:text-[10px] uppercase tracking-wider">
                          Joined
                        </span>
                      </div>
                    </div>

                    {/* Far Right: Arrow */}
                    <div className="w-7 h-7 sm:w-10 sm:h-10 shrink-0 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-400 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
                      <ChevronRight size={14} className="sm:w-5 sm:h-5" />
                    </div>
                  </div>

                  {/* Bottom Section: Origin */}
                  <div className="bg-neutral-200 border-t border-neutral-300 py-1.5 sm:py-2 px-3 sm:px-6 flex items-center justify-center">
                    <div className="flex items-center text-neutral-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest truncate">
                      <MapPin size={10} className="mr-1 shrink-0" />
                      <span className="truncate">FROM: {ride.pickupZone === 'MAIN' || ride.pickupZone === 'BOSTON COLLEGE' ? 'BOSTON COLLEGE' : ride.pickupZone.replace('_', ' ').toUpperCase()}</span>
                    </div>
                  </div>

                </div>
              </Link>
            );
          })
        ) : (

          <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-8 sm:p-12 md:p-20 text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Filter size={24} className="text-neutral-300" />
            </div>
            <h3 className="text-xl font-bold text-neutral-800">No Matches Found</h3>
            <p className="text-neutral-500 max-w-xs mx-auto mt-2 mb-8 text-sm">We couldn't find any active rides for this destination. Try a broader search or offer your own ride!</p>
            <button 
              onClick={() => setFilterDestination('ALL')}
              className="bg-black text-white px-8 py-3 rounded-xl font-bold text-sm hover:bg-neutral-800 transition-colors"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default FindRides;

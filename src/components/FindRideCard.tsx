import React from 'react';
import {Link} from 'react-router-dom';
import {MapPin,ChevronRight} from 'lucide-react';
import {locationLabel,rideCategory,type PersistedRide} from '../../shared/rides';
import {campusMatchNote} from '../lib/findRidePresentation';
export default function FindRideCard({ride,currentUserId,search}:{ride:PersistedRide;currentUserId?:string;search:Record<string,string>}){
  const owned=!!currentUserId && ride.hostUserId===currentUserId;
  const note=campusMatchNote(ride,search);
  return (
    <Link to={`/ride/${ride.id}`} className="group">
      <div className={`bg-white rounded-2xl overflow-hidden transition-all ${owned ? 'border-2 border-neutral-800 hover:border-black group-focus-visible:border-black' : 'border border-neutral-200 hover:border-black group-focus-visible:border-black'}`}>
        
        {owned && <p className="px-3.5 sm:px-6 pt-2 text-xs font-medium text-neutral-600">Your ride</p>}
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
              {locationLabel(ride.destination)}
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
                {ride.cancelledAt ? 'Cancelled' : rideCategory(ride) === 'past' ? 'Past' : ride.seatsTaken >= ride.seatsTotal ? 'Full' : 'View / Join'}
              </span>
            </div>
          </div>

          {/* Far Right: Arrow */}
          <div className="w-7 h-7 sm:w-10 sm:h-10 shrink-0 rounded-full border border-neutral-200 flex items-center justify-center text-neutral-400 group-hover:bg-black group-hover:text-white group-hover:border-black transition-all">
            <ChevronRight size={14} className="sm:w-5 sm:h-5" />
          </div>
        </div>

        {note && <p className="px-3.5 sm:px-6 pb-2 text-xs text-neutral-500">{note}</p>}
        {/* Bottom Section: Origin */}
        <div className="bg-neutral-200 border-t border-neutral-300 py-1.5 sm:py-2 px-3 sm:px-6 flex items-center justify-center">
          <div className="flex items-center text-neutral-500 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest truncate">
            <MapPin size={10} className="mr-1 shrink-0" />
            <span className="truncate">FROM: {locationLabel(ride.origin)}</span>
          </div>
        </div>

      </div>
    </Link>
  );
}

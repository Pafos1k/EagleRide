
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  X, 
  Calendar, 
  Clock, 
  ChevronDown,
  Navigation,
  MapPin,
  Plane,
  Train,
  Briefcase,
  Home,
  Bus,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { createRide, listRides } from '../src/api/rides';
import type { PersistedRide, RideLocation } from '../shared/rides';
import { useAuth } from '../src/auth/AuthProvider';
import { signInPath } from '../shared/authReturn';
import HeroPhone from '../src/components/HeroPhone';
import { 
  estimateRideCost, 
  getFareBreakdown
} from '../src/utils/priceEstimator';
import { 
  LuggageType,
  FlexibilityType
} from '../types';

const LocationItem = React.memo(({ name, address, icon, onClick }: { name: string, address: string, icon: React.ReactNode, onClick: () => void }) => (
  <div 
    className="flex items-center px-5 py-4 cursor-pointer hover:bg-neutral-50 transition-colors border-b border-neutral-50 last:border-none" 
    onClick={onClick}
  >
    <div className="w-10 h-10 bg-neutral-100 rounded-full flex items-center justify-center shrink-0 text-black">
      {icon}
    </div>
    <div className="ml-4">
      <p className="font-bold text-[15px]">{name}</p>
      <p className="text-[12px] text-neutral-500">{address}</p>
    </div>
  </div>
));

const CreateRide: React.FC = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  const [pickup, setPickup] = useState('');
  const [destination, setDestination] = useState('');
  const [terminal, setTerminal] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'similar' | 'confirm'>('form');
  const [similarRides, setSimilarRides] = useState<PersistedRide[]>([]);
  const [focusedField, setFocusedField] = useState<'pickup' | 'destination' | null>(null);
  
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState('Now');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [viewDate, setViewDate] = useState(new Date());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const pickupRef = useRef<HTMLDivElement>(null);
  const destinationRef = useRef<HTMLDivElement>(null);

  // Automatically scroll back to top of the panel and window when switching steps
  useEffect(() => {
    if (leftPanelRef.current) {
      leftPanelRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  const locations = [
    { name: 'Boston College', address: '140 Commonwealth Ave, Chestnut Hill, MA', icon: <Home size={20} /> },
    { name: 'Newton Campus', address: '885 Centre St, Newton, MA', icon: <MapPin size={20} /> },
    { name: 'Logan Airport (BOS)', address: 'Logan International Airport, Boston, MA', icon: <Plane size={20} /> },
    { name: 'South Station', address: '700 Atlantic Ave, Boston, MA', icon: <Train size={20} /> },
    { name: '177 Huntington Ave', address: '177 Huntington Ave, Boston, MA', icon: <Bus size={20} /> },
  ];

  const times = React.useMemo(() => Array.from({ length: 48 }, (_, i) => {
    const slot = (i + 10) % 48;
    const hour = Math.floor(slot / 2);
    const min = (slot % 2) * 30;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${min === 0 ? '00' : min} ${ampm}`;
  }), []);

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const calendarDays = React.useMemo(() => {
    const days = [];
    const totalDays = daysInMonth(viewDate.getFullYear(), viewDate.getMonth());
    const offset = firstDayOfMonth(viewDate.getFullYear(), viewDate.getMonth());

    for (let i = 0; i < offset; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(i);
    return days;
  }, [viewDate]);

  const isToday = (day: number) => {
    const d = new Date();
    return d.getDate() === day && d.getMonth() === viewDate.getMonth() && d.getFullYear() === viewDate.getFullYear();
  };

  const isPastDate = (day: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const checkDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return checkDate < d;
  };

  const isSelected = (day: number) => {
    return selectedDate.getDate() === day && selectedDate.getMonth() === viewDate.getMonth() && selectedDate.getFullYear() === viewDate.getFullYear();
  };

  const isDateToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  useEffect(() => {
    if (!isDateToday(selectedDate) && selectedTime === 'Now') {
      setSelectedTime('12:00 PM');
    }
  }, [selectedDate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        setFocusedField(null);
        setShowDatePicker(false);
        setShowTimePicker(false);
        return;
      }
      if (focusedField === 'pickup' && pickupRef.current && !pickupRef.current.contains(target)) {
        setFocusedField(null);
      }
      if (focusedField === 'destination' && destinationRef.current && !destinationRef.current.contains(target)) {
        setFocusedField(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [focusedField]);

  const handleLocationClick = (locName: string) => {
    if (focusedField === 'pickup') {
      setPickup(locName);
      if (!locName.includes('Airport') && !destination.includes('Airport')) {
        setTerminal(null);
      }
      setFocusedField('destination');
    } else if (focusedField === 'destination') {
      setDestination(locName);
      if (!locName.includes('Airport') && !pickup.includes('Airport')) {
        setTerminal(null);
      }
      setFocusedField(null);
    }
  };

  const getDepartureDate = () => {
    const d = new Date(selectedDate);
    if (selectedTime === 'Now') {
      const now = new Date();
      d.setHours(now.getHours(), now.getMinutes(), 0, 0);
    } else {
      const [time, ampm] = selectedTime.split(' ');
      let [h, m] = time.split(':').map(Number);
      if (ampm === 'PM' && h !== 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      d.setHours(h, m, 0, 0);
    }
    return d;
  };

  const findSimilarRides = async () => {
    const allRides = await listRides();
    const departureDate = getDepartureDate();
    const isAirport = pickup.includes('Airport') || destination.includes('Airport');
    const oneHour = 60 * 60 * 1000;

    return allRides.filter((r) => {
      const sameDest = r.destination.name.toLowerCase() === destination.trim().toLowerCase();
      const sameOrigin = r.origin.name.toLowerCase() === pickup.trim().toLowerCase();
      
      if (!sameDest || !sameOrigin) return false;
      if (isAirport && terminal && (r.origin.terminal || r.destination.terminal) !== terminal) return false;

      const rideTime = new Date(r.departureTime).getTime();
      const diff = Math.abs(rideTime - departureDate.getTime());
      
      return diff <= oneHour && r.seatsTaken < r.seatsTotal;
    });
  };

  useEffect(() => {
    // Editing trip inputs invalidates the previous search/confirmation.
    setStep('form');
  }, [selectedDate, selectedTime, pickup, destination, terminal]);

  const requireIdentity = () => {
    if (authLoading) return false;
    if (!user) { navigate(signInPath('/create')); return false; }
    return true;
  };

  const handleContinue = async () => {
    if (submitting.current || !pickup.trim() || !destination.trim()) return;
    if ((pickup.includes('Airport') || destination.includes('Airport')) && !terminal) return;
    if (!requireIdentity()) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const found = await findSimilarRides();
      setSimilarRides(found);
      setStep(found.length ? 'similar' : 'confirm');
    } catch {
      setError('Unable to search rides. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const rideLocation = (name: string): RideLocation => ({
    name: name.trim(),
    address: locations.find(location => location.name === name)?.address ?? null,
    terminal: name.includes('Airport') ? terminal as RideLocation['terminal'] : null,
  });

  const handleCreateRide = async () => {
    if (submitting.current) return;
    if (!requireIdentity()) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    const departureTime = getDepartureDate().toISOString();
    try {
      const ride = await createRide({
        origin: rideLocation(pickup), destination: rideLocation(destination),
        departureTime, seatsTotal: 4, luggageType: LuggageType.ONE_SUITCASE,
        flexibility: FlexibilityType.PLUS_MINUS_30,
        estimatedTotalCostCents: Math.round(estimateRideCost(destination, departureTime, pickup, terminal) * 100),
        hostNote: null,
      });
      navigate(`/ride/${ride.id}`);
    } catch {
      setError('Could not confirm the ride was saved. Check Find Rides before retrying.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const formatDateLabel = (date: Date) => {
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-80px)] lg:h-[calc(100vh-80px)] bg-white" ref={containerRef}>
      {/* LEFT PANEL */}
      <div 
        ref={leftPanelRef} 
        className="w-full lg:w-[45%] bg-white lg:h-full lg:overflow-y-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 sm:pt-8 sm:pb-16 lg:pt-10 lg:pb-24 flex flex-col items-center justify-start shrink-0 relative z-10"
      >
        <div className="w-full max-w-[480px] flex flex-col">
          <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-bold leading-[1.1] mb-6 sm:mb-8 lg:mb-10 tracking-tight text-black text-center">Request a ride</h1>

          {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
          {busy && <p role="status" className="mb-4 text-sm text-neutral-500">Please wait...</p>}
          <fieldset disabled={busy} inert={busy} className="space-y-4 relative w-full">
          {/* PICKUP */}
          <div className="relative" ref={pickupRef}>
            <div 
              className={`uber-input-container ${focusedField === 'pickup' ? 'active shadow-lg' : ''}`}
              onClick={() => { setFocusedField('pickup'); setShowDatePicker(false); setShowTimePicker(false); }}
            >
              <div className="w-4 h-4 rounded-full border-2 border-black flex items-center justify-center bg-white shrink-0 relative z-10">
                 <div className="w-1.5 h-1.5 bg-black rounded-full"></div>
              </div>
              <input 
                className="uber-input"
                placeholder="Pickup location"
                value={pickup}
                onFocus={() => { setFocusedField('pickup'); setShowDatePicker(false); setShowTimePicker(false); }}
                onChange={(e) => setPickup(e.target.value)}
              />
              {pickup && (
                <button onClick={(e) => { e.stopPropagation(); setPickup(''); setFocusedField(null); }} className="text-neutral-400 p-1 hover:text-black">
                  <X size={18} />
                </button>
              )}
              <button className="ml-1 text-black p-1 hover:bg-neutral-200 rounded-full">
                <Navigation size={18} fill="currentColor" className="rotate-45" />
              </button>
            </div>

            {focusedField === 'pickup' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-100 shadow-2xl rounded-xl z-[100] py-2 animate-slide overflow-y-auto max-h-60">
                {locations.map((loc, idx) => (
                  <LocationItem 
                    key={idx} 
                    name={loc.name} 
                    address={loc.address} 
                    icon={loc.icon} 
                    onClick={() => handleLocationClick(loc.name)} 
                  />
                ))}
              </div>
            )}
          </div>

          {/* DESTINATION */}
          <div className="relative" ref={destinationRef}>
            <div 
              className={`uber-input-container ${focusedField === 'destination' ? 'active shadow-lg' : ''}`}
              onClick={() => { setFocusedField('destination'); setShowDatePicker(false); setShowTimePicker(false); }}
            >
              <div className="w-4 h-4 border-2 border-black flex items-center justify-center bg-white shrink-0 relative z-10">
                 <div className="w-1.5 h-1.5 bg-black"></div>
              </div>
              <input 
                className="uber-input"
                placeholder="Dropoff location"
                value={destination}
                onFocus={() => { setFocusedField('destination'); setShowDatePicker(false); setShowTimePicker(false); }}
                onChange={(e) => setDestination(e.target.value)}
              />
              {destination && (
                <button onClick={(e) => { e.stopPropagation(); setDestination(''); setFocusedField(null); }} className="text-neutral-400 p-1 hover:text-black">
                  <X size={18} />
                </button>
              )}
            </div>

            {focusedField === 'destination' && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-neutral-100 shadow-2xl rounded-xl z-[100] py-2 animate-slide overflow-y-auto max-h-60">
                {locations.map((loc, idx) => (
                  <LocationItem 
                    key={idx} 
                    name={loc.name} 
                    address={loc.address} 
                    icon={loc.icon} 
                    onClick={() => handleLocationClick(loc.name)} 
                  />
                ))}
              </div>
            )}
          </div>

          {/* TERMINAL SELECTION FOR LOGAN */}
          {(pickup.includes('Airport') || destination.includes('Airport')) && (
            <div className="animate-slide space-y-6">
              <div>
                <p className="text-[12px] font-bold text-neutral-400 uppercase tracking-widest mb-3 ml-1">
                  Terminal
                </p>
                <div className="flex space-x-2">
                  {['A', 'B', 'C', 'E'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setTerminal(t)}
                      className={`flex-1 py-3 rounded-xl font-bold text-[16px] transition-all border-2 
                        ${terminal === t ? 'border-black bg-black text-white shadow-md' : 'border-transparent bg-neutral-100 text-black hover:bg-neutral-200'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* DATE & TIME SELECTORS - Precise UI Match to Screenshot */}
          <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3 pt-2">
            <div className="flex-1 relative">
              <div 
                className={`flex items-center h-[52px] sm:h-[56px] px-4 sm:px-5 rounded-xl cursor-pointer transition-all border-2 
                ${showDatePicker ? 'border-black bg-white shadow-md' : 'border-transparent bg-neutral-100 hover:bg-neutral-200'}`}
                onClick={() => { setShowDatePicker(!showDatePicker); setShowTimePicker(false); setFocusedField(null); }}
              >
                <Calendar size={18} className="text-black shrink-0 sm:w-5 sm:h-5" />
                <span className="ml-3 sm:ml-4 font-bold text-[15px] sm:text-[17px] text-black tracking-tight">{formatDateLabel(selectedDate)}</span>
              </div>
              
              {showDatePicker && (
                <>
                  <div className="fixed inset-0 bg-transparent z-[105] md:hidden" onClick={() => setShowDatePicker(false)} />
                  <div className="fixed md:absolute bottom-4 sm:bottom-6 md:bottom-auto md:top-full left-3 right-3 sm:left-4 sm:right-4 md:left-0 md:right-auto md:mt-3 bg-white border border-neutral-100 shadow-2xl rounded-[24px] z-[110] p-4 sm:p-5 md:p-6 animate-slide md:w-[320px] max-h-[85vh] overflow-y-auto">
                    <div className="flex items-center justify-between mb-6">
                       <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1))} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
                         <ChevronLeft size={20} className="text-neutral-500" />
                       </button>
                       <span className="font-bold text-[16px] md:text-[18px] text-black">{viewDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                       <button onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1))} className="p-2 hover:bg-neutral-100 rounded-full transition-colors">
                         <ChevronRight size={20} className="text-neutral-500" />
                       </button>
                    </div>
                    
                    <div className="grid grid-cols-7 gap-y-1 md:gap-y-2 text-center">
                      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                        <div key={day} className="text-[11px] md:text-[12px] font-bold text-neutral-400 uppercase tracking-widest">{day}</div>
                      ))}
                      {calendarDays.map((day, i) => {
                        const isSel = Boolean(day && isSelected(day));
                        const isTod = Boolean(day && isToday(day));
                        const isPast = Boolean(day && isPastDate(day));

                        return (
                          <div 
                            key={i} 
                            className={`text-[14px] md:text-[16px] font-bold h-9 w-9 md:h-10 md:w-10 flex items-center justify-center mx-auto rounded-full transition-all cursor-pointer relative
                              ${day === null ? 'pointer-events-none text-transparent' : ''}
                              ${isPast ? 'opacity-20 cursor-not-allowed pointer-events-none' : ''}
                              ${isSel ? 'bg-black text-white shadow-md scale-105' : ''}
                              ${!isSel && isTod ? 'ring-2 ring-neutral-400 text-black bg-neutral-100' : ''}
                              ${!isSel && !isTod && !isPast && day !== null ? 'text-black hover:bg-neutral-200' : ''}
                            `}
                            onClick={() => {
                              if (day && !isPast) {
                                setSelectedDate(new Date(viewDate.getFullYear(), viewDate.getMonth(), day));
                                setShowDatePicker(false);
                              }
                            }}
                          >
                            {day}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex-1 relative">
              <div 
                className={`flex items-center h-[52px] sm:h-[56px] px-4 sm:px-5 rounded-xl cursor-pointer transition-all border-2 
                ${showTimePicker ? 'border-black bg-white shadow-md' : 'border-transparent bg-neutral-100 hover:bg-neutral-200'}`}
                onClick={() => { setShowTimePicker(!showTimePicker); setShowDatePicker(false); setFocusedField(null); }}
              >
                <Clock size={18} className="text-black shrink-0 sm:w-5 sm:h-5" />
                <span className="ml-3 sm:ml-4 font-bold text-[15px] sm:text-[17px] text-black tracking-tight">{selectedTime}</span>
                <ChevronDown size={18} className="ml-auto text-black shrink-0 sm:w-5 sm:h-5" />
              </div>
              {showTimePicker && (
                <>
                  <div className="fixed inset-0 bg-transparent z-[105] md:hidden" onClick={() => setShowTimePicker(false)} />
                  <div className="fixed md:absolute bottom-4 sm:bottom-6 md:bottom-auto md:top-full left-3 right-3 sm:left-4 sm:right-4 md:left-0 md:right-0 md:mt-3 bg-white border border-neutral-100 shadow-2xl rounded-xl z-[110] max-h-[320px] overflow-y-auto py-2 animate-slide scrollbar-hide">
                     {isDateToday(selectedDate) && (
                       <div className="px-5 py-4 hover:bg-neutral-100 cursor-pointer font-bold text-[16px] border-b border-neutral-50" onClick={() => { setSelectedTime('Now'); setShowTimePicker(false); }}>Now</div>
                     )}
                     {times.filter(t => {
                       if (!isDateToday(selectedDate)) return true;
                       const [time, ampm] = t.split(' ');
                       let [h, m] = time.split(':').map(Number);
                       if (ampm === 'PM' && h !== 12) h += 12;
                       if (ampm === 'AM' && h === 12) h = 0;
                       const now = new Date();
                       return h > now.getHours() || (h === now.getHours() && m > now.getMinutes());
                     }).map((t, i) => (
                       <div key={i} className="px-5 py-4 hover:bg-neutral-100 cursor-pointer font-bold text-[16px]" onClick={() => { setSelectedTime(t); setShowTimePicker(false); }}>{t}</div>
                     ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </fieldset>

        {step === 'form' && (
          <div className="mt-8 sm:mt-12 max-w-lg w-full">
            {pickup && destination && (!(pickup.includes('Airport') || destination.includes('Airport')) || terminal) && (() => {
              const preview = getFareBreakdown(destination, getDepartureDate().toISOString(), pickup, 1, terminal);
              return (
                <div className="mb-4 px-4 py-3 bg-neutral-50 rounded-2xl border border-neutral-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-neutral-500 font-medium">Estimated fare</span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="font-bold text-lg text-neutral-900">${preview.totalEstimatedCost.toFixed(2)}</span>
                      <span className="text-xs text-neutral-400 font-medium">· {preview.distanceMiles} mi</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-emerald-600 font-medium">Split 4 ways</span>
                    <p className="font-bold text-base text-emerald-700 mt-0.5">${(preview.totalEstimatedCost / 4).toFixed(2)} <span className="text-xs font-normal text-neutral-400">/ ea</span></p>
                  </div>
                </div>
              );
            })()}
            <button 
              onClick={handleContinue}
              disabled={busy || !pickup || !destination || ((pickup.includes('Airport') || destination.includes('Airport')) && !terminal)}
              className={`w-full py-3.5 sm:py-4 rounded-xl font-bold text-[17px] sm:text-[19px] transition-all active:scale-[0.98] ${
                pickup && destination && (!(pickup.includes('Airport') || destination.includes('Airport')) || terminal) ? 'bg-black text-white hover:bg-neutral-800 shadow-xl' : 'bg-neutral-100 text-neutral-400 cursor-not-allowed'
              }`}
            >
              Continue
            </button>
          </div>
        )}

        {step === 'similar' && (
          <div className="mt-8 sm:mt-12 max-w-lg w-full animate-slide">
            <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Similar rides found</h2>
            <div className="space-y-4 mb-6 sm:mb-8">
              {similarRides.map((ride) => {
                const currentCost = ((ride.estimatedTotalCostCents / 100) / Math.max(1, ride.seatsTaken)).toFixed(2);
                const nextCost = ((ride.estimatedTotalCostCents / 100) / (ride.seatsTaken + 1)).toFixed(2);
                return (
                  <div key={ride.id} className="bg-neutral-50 p-4 sm:p-5 rounded-2xl border border-neutral-100 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-[15px] sm:text-[17px]">
                          {new Date(ride.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                          ${nextCost} / person
                        </span>
                      </div>
                      <p className="text-neutral-500 text-[12px] sm:text-[13px] truncate mt-0.5">
                        {(ride.origin.terminal || ride.destination.terminal) ? `Terminal ${ride.origin.terminal || ride.destination.terminal} • ` : ''}{ride.seatsTotal - ride.seatsTaken} seats left (currently ${currentCost})
                      </p>
                    </div>
                    <button 
                      onClick={() => navigate(`/ride/${ride.id}`)}
                      className="bg-black text-white px-5 sm:px-6 py-2 rounded-full font-bold text-[13px] sm:text-[14px] hover:bg-neutral-800 transition-colors shrink-0"
                    >
                      View
                    </button>
                  </div>
                );
              })}
            </div>
            <button 
              disabled={busy}
              onClick={() => setStep('confirm')}
              className="w-full py-3.5 sm:py-4 rounded-xl font-bold text-[15px] sm:text-[17px] border-2 border-neutral-200 hover:bg-neutral-50 transition-colors"
            >
              Create my own ride
            </button>
            <button 
              disabled={busy}
              onClick={() => setStep('form')}
              className="w-full mt-4 text-neutral-500 font-bold text-[14px] hover:text-black transition-colors"
            >
              Go back
            </button>
          </div>
        )}

        {step === 'confirm' && (() => {
          const breakdown = getFareBreakdown(destination, getDepartureDate().toISOString(), pickup, 1, terminal);
          return (
            <div className="mt-8 sm:mt-12 max-w-lg w-full animate-slide">
              <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Confirm your ride</h2>
              <div className="bg-neutral-50 p-4 sm:p-5 rounded-2xl border border-neutral-100 space-y-3 mb-6 sm:mb-8 text-sm sm:text-base">
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 font-medium">From</span>
                  <span className="font-bold text-right ml-2 truncate">{pickup}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 font-medium">To</span>
                  <span className="font-bold text-right ml-2 truncate">{destination}</span>
                </div>
                {(pickup.includes('Airport') || destination.includes('Airport')) && (
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-500 font-medium">Terminal</span>
                    <span className="font-bold">{terminal}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-neutral-500 font-medium">Time</span>
                  <span className="font-bold">{formatDateLabel(selectedDate)}, {selectedTime}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-neutral-500 pt-3 border-t border-neutral-200">
                  <span className="font-medium">Trip</span>
                  <a className="underline" target="_blank" rel="noopener noreferrer" href={'https://www.google.com/maps/dir/?api=1&origin=' + encodeURIComponent(pickup) + '&destination=' + encodeURIComponent(destination)}>Check live route in Google Maps</a>
                </div>



                <div className="pt-3 border-t border-neutral-200 flex justify-between items-center">
                  <div>
                    <span className="text-neutral-500 font-medium text-sm block">Estimated fare</span>
                    <span className="text-xs text-emerald-600 font-medium">~${(breakdown.totalEstimatedCost / 4).toFixed(2)} / rider (split 4 ways)</span>
                  </div>
                  <span className="text-2xl sm:text-3xl font-bold text-black">
                    ${breakdown.totalEstimatedCost.toFixed(2)}
                  </span>
                </div>
              </div>
              <button 
                onClick={handleCreateRide}
                disabled={busy}
                className="w-full py-3.5 sm:py-4 rounded-xl bg-black text-white font-bold text-[17px] sm:text-[19px] hover:bg-neutral-800 shadow-xl transition-all active:scale-[0.98]"
              >
                Post Ride
              </button>
              <button 
                disabled={busy}
              onClick={() => setStep('form')}
                className="w-full mt-4 text-neutral-500 font-bold text-[14px] hover:text-black transition-colors"
              >
                Edit details
              </button>
            </div>
          );
        })()}

        <div className="mt-8 sm:mt-12 lg:mt-16 bg-neutral-50 rounded-2xl p-4 sm:p-6 border border-neutral-100 w-full">
          <div className="flex items-center space-x-3 mb-3 sm:mb-4">
             <div className="w-9 h-9 sm:w-10 sm:h-10 bg-black text-white rounded-full flex items-center justify-center shrink-0">
               <Navigation size={18} className="sm:w-5 sm:h-5" />
             </div>
             <p className="font-bold text-[16px] sm:text-[18px]">Ride with confidence</p>
          </div>
          <p className="text-neutral-500 text-[13px] sm:text-[14px] leading-relaxed">
            Get a reliable ride in minutes. EagleRide matches you with other BC students heading to the same destination to help you save on fares.
          </p>
        </div>
        </div>
      </div>

      {/* RIGHT PANEL - Dynamic Visualization */}
      <div className="flex-1 bg-white hidden lg:flex items-center justify-center relative overflow-visible">
        <HeroPhone />
      </div>
    </div>
  );
};

export default CreateRide;

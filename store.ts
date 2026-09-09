
import { 
  User, Ride, RideParticipant, Message, 
  DestinationType, PickupZoneType, LuggageType, 
  FlexibilityType, RideStatusType, ParticipantStatusType, 
  ChatStatusType 
} from './types';

import { estimateRideCost } from './src/utils/priceEstimator';

// Mock Current User (Baldwin the Eagle)
export const CURRENT_USER: User = {
  id: 'u1',
  fullName: 'Baldwin Eagle',
  bcEmail: 'baldwin@bc.edu',
  phoneNumber: '617-552-0000',
  reliabilityScore: 98,
  completedRidesCount: 24,
  cancelledRidesCount: 1,
  isSuspended: false,
  createdAt: new Date().toISOString()
};

const INITIAL_RIDES: Ride[] = [
  {
    id: 'r1',
    hostUserId: 'u2',
    destination: DestinationType.LOGAN,
    destinationAddress: 'Logan International Airport (BOS)',
    terminal: 'C',
    pickupZone: PickupZoneType.MAIN,
    rideDate: '2025-02-18',
    departureTime: new Date(2025, 1, 18, 12, 0).toISOString(),
    seatsTotal: 4,
    seatsTaken: 2,
    luggageType: LuggageType.ONE_SUITCASE,
    flexibility: FlexibilityType.PLUS_MINUS_30,
    estimatedTotalCost: estimateRideCost(DestinationType.LOGAN, new Date(2025, 1, 18, 12, 0).toISOString(), PickupZoneType.MAIN, 'C'),
    status: RideStatusType.OPEN,
    chatStatus: ChatStatusType.LOCKED,
    confirmationDeadline: new Date(2025, 1, 18, 9, 0).toISOString()
  },
  {
    id: 'r2',
    hostUserId: 'u3',
    destination: DestinationType.SOUTH_STATION,
    destinationAddress: 'South Station Bus Terminal',
    pickupZone: PickupZoneType.NEWTON,
    rideDate: '2025-02-19',
    departureTime: new Date(2025, 1, 19, 14, 30).toISOString(),
    seatsTotal: 3,
    seatsTaken: 1,
    luggageType: LuggageType.CARRY_ON_ONLY,
    flexibility: FlexibilityType.EXACT,
    estimatedTotalCost: estimateRideCost(DestinationType.SOUTH_STATION, new Date(2025, 1, 19, 14, 30).toISOString(), PickupZoneType.NEWTON),
    status: RideStatusType.OPEN,
    chatStatus: ChatStatusType.LOCKED,
    confirmationDeadline: new Date(2025, 1, 19, 11, 30).toISOString()
  }
];

const INITIAL_PARTICIPANTS: RideParticipant[] = [
  { id: 'p1', rideId: 'r1', userId: 'u2', status: ParticipantStatusType.ACCEPTED, joinedAt: new Date().toISOString() },
  { id: 'p2', rideId: 'r1', userId: 'u4', status: ParticipantStatusType.ACCEPTED, joinedAt: new Date().toISOString() },
  { id: 'p3', rideId: 'r2', userId: 'u3', status: ParticipantStatusType.ACCEPTED, joinedAt: new Date().toISOString() },
];

export const useMockStore = () => {
  const getRides = () => {
    const stored = localStorage.getItem('er_rides');
    return stored ? JSON.parse(stored) : INITIAL_RIDES;
  };

  const getParticipants = () => {
    const stored = localStorage.getItem('er_participants');
    return stored ? JSON.parse(stored) : INITIAL_PARTICIPANTS;
  };

  const saveRides = (rides: Ride[]) => localStorage.setItem('er_rides', JSON.stringify(rides));
  const saveParticipants = (parts: RideParticipant[]) => localStorage.setItem('er_participants', JSON.stringify(parts));

  return { getRides, getParticipants, saveRides, saveParticipants };
};

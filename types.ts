export enum DestinationType {
  LOGAN = 'LOGAN',
  SOUTH_STATION = 'SOUTH_STATION',
  HUNTINGTON_177 = 'HUNTINGTON_177',
  BOSTON_COLLEGE = 'BOSTON_COLLEGE',
  NEWTON_CAMPUS = 'NEWTON_CAMPUS'
}

export enum PickupZoneType {
  MAIN = 'BOSTON COLLEGE',
  NEWTON = 'NEWTON',
  OFF_CAMPUS = 'OFF_CAMPUS'
}

export enum LuggageType {
  CARRY_ON_ONLY = 'CARRY_ON_ONLY',
  ONE_SUITCASE = 'ONE_SUITCASE',
  MULTIPLE = 'MULTIPLE'
}

export enum FlexibilityType {
  EXACT = 'EXACT',
  PLUS_MINUS_30 = 'PLUS_MINUS_30',
  PLUS_MINUS_60 = 'PLUS_MINUS_60'
}

export enum RideStatusType {
  OPEN = 'OPEN',
  FULL = 'FULL',
  CONFIRMATION_PENDING = 'CONFIRMATION_PENDING',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum ParticipantStatusType {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW'
}

export enum ChatStatusType {
  LOCKED = 'LOCKED',
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED'
}

export interface User {
  id: string;
  fullName: string;
  bcEmail: string;
  phoneNumber: string;
  reliabilityScore: number;
  completedRidesCount: number;
  cancelledRidesCount: number;
  isSuspended: boolean;
  suspensionUntil?: string;
  createdAt: string;
}

export interface Ride {
  id: string;
  hostUserId: string;
  destination: DestinationType;
  destinationAddress: string;
  terminal?: string;
  gate?: string;
  pickupZone: PickupZoneType;
  rideDate: string;
  departureTime: string;
  seatsTotal: number;
  seatsTaken: number;
  luggageType: LuggageType;
  flexibility: FlexibilityType;
  estimatedTotalCost: number;
  status: RideStatusType;
  chatStatus: ChatStatusType;
  confirmationDeadline: string;
  hostNote?: string;
}

export interface RideParticipant {
  id: string;
  rideId: string;
  userId: string;
  status: ParticipantStatusType;
  joinedAt: string;
  acceptedAt?: string;
  confirmedAt?: string;
}

export interface Message {
  id: string;
  rideId: string;
  senderId: string;
  message: string;
  createdAt: string;
}

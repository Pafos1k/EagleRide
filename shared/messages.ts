export interface RideMessage {
  id: string;
  rideId: string;
  senderUserId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  body: string;
  createdAt: string;
}
export interface RideChat {
  cancelledAt: string | null;
  messages: RideMessage[];
}

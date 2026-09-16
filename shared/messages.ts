export interface RideMessage {
  id: string;
  rideId: string;
  senderUserId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  body: string;
  reactions?: {userId:string;emoji:string}[];
  createdAt: string;
}
export interface RideChat {
  revision: string;
  cancelledAt: string | null;
  messages: RideMessage[];
}

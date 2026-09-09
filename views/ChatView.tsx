
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, Info, MoreVertical } from 'lucide-react';
import { useMockStore, CURRENT_USER } from '../store';
import { Ride, Message } from '../types';

const ChatView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRides } = useMockStore();
  const [ride, setRide] = useState<Ride | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const r = getRides().find((r: Ride) => r.id === id);
    if (r) {
      setRide(r);
      // Mock initial messages
      setMessages([
        { id: 'm1', rideId: id!, senderId: 'u2', message: "Hey everyone! Looking forward to the ride to Logan. I'll be near the Upper Gate at 2:45.", createdAt: new Date(Date.now() - 100000).toISOString() }
      ]);
    }
  }, [id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessage: Message = {
      id: `m-${Date.now()}`,
      rideId: id!,
      senderId: CURRENT_USER.id,
      message: input,
      createdAt: new Date().toISOString()
    };

    setMessages([...messages, newMessage]);
    setInput('');
  };

  if (!ride) return null;

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-130px)] sm:h-[calc(100vh-160px)] flex flex-col bg-white border border-slate-200 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm m-2 sm:m-0">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-3 sm:p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
          <button onClick={() => navigate(-1)} className="p-1.5 sm:p-2 hover:bg-slate-50 rounded-full transition-colors shrink-0">
            <ArrowLeft size={18} className="text-slate-500 sm:w-5 sm:h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800 text-sm sm:text-base truncate">Ride to {ride.destination.replace('_', ' ')}</h2>
            <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest flex items-center">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5"></span> Active Chat
            </p>
          </div>
        </div>
        <button className="p-1.5 sm:p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 shrink-0">
          <MoreVertical size={18} className="sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col items-center">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 sm:p-4 text-center max-w-sm">
            <Info size={16} className="text-bc-maroon mx-auto mb-1.5 sm:mb-2" />
            <p className="text-xs text-slate-500 font-medium">
              This chat is now active. Coordinate your pickup details and keep your EagleRide status updated.
            </p>
          </div>
        </div>

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderId === CURRENT_USER.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 ${
              m.senderId === CURRENT_USER.id 
              ? 'bg-bc-maroon text-white rounded-tr-none shadow-md shadow-bc-maroon/10' 
              : 'bg-slate-100 text-slate-700 rounded-tl-none border border-slate-200'
            }`}>
              {m.senderId !== CURRENT_USER.id && (
                <p className="text-[10px] font-bold text-bc-maroon mb-1 uppercase tracking-wider">Eagle Participant</p>
              )}
              <p className="text-xs sm:text-sm leading-relaxed">{m.message}</p>
              <p className={`text-[10px] mt-1 text-right ${m.senderId === CURRENT_USER.id ? 'text-white/60' : 'text-slate-400'}`}>
                {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 sm:p-4 bg-slate-50 border-t border-slate-100">
        <div className="relative">
          <input 
            type="text" 
            placeholder="Type your message..."
            className="w-full bg-white border border-slate-200 rounded-xl sm:rounded-2xl py-2.5 sm:py-3 pl-3.5 sm:pl-4 pr-12 sm:pr-14 font-medium text-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-bc-maroon/20 focus:border-bc-maroon transition-all"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button 
            type="submit"
            className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 bg-bc-maroon text-white rounded-lg sm:rounded-xl flex items-center justify-center hover:bg-red-800 transition-all shadow-lg shadow-bc-maroon/20"
          >
            <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatView;

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, Info, RefreshCw } from 'lucide-react';
import { getChat, getRide, sendMessage, ApiError } from '../src/api/rides';
import { useAuth } from '../src/auth/AuthProvider';
import { locationLabel, type PersistedRide } from '../shared/rides';
import type { RideChat } from '../shared/messages';

const ChatView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ride, setRide] = useState<PersistedRide | null>(null);
  const [chat, setChat] = useState<RideChat | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const sending = useRef(false);
  const generation = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setChat(null); setRide(null); setLoading(true); setError('');
    (async () => {
      const history = await getChat(id!, controller.signal);
      const detail = await getRide(id!, controller.signal);
      if (!controller.signal.aborted && generation.current === current) { setChat(history); setRide(detail); }
    })().catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); ++generation.current; };
  }, [id, user?.id, reload]);
  const messages = chat?.messages ?? [];
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending.current || !chat || chat.cancelledAt || !input.trim()) return;
    const current = generation.current;
    sending.current = true; setBusy(true); setError('');
    try {
      const updated = await sendMessage(id!, input.trim());
      if (current === generation.current) { setChat(updated); setInput(''); }
    } catch (error) {
      if (current !== generation.current) return;
      setError(error instanceof Error ? error.message : 'Unable to send message.');
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setChat(null);
      if (error instanceof ApiError && error.status === 409) {
        try { const updated = await getChat(id!); if (current === generation.current) setChat(updated); }
        catch { if (current === generation.current) setChat(null); }
      }
    } finally { sending.current = false; setBusy(false); }
  };
  if (loading) return <p role="status" className="p-8 text-center">Loading chat...</p>;
  if (!chat || !ride) return <div className="p-8 text-center"><p role="alert">{error || 'Chat unavailable.'}</p><button onClick={() => setReload(v => v + 1)} className="underline">Retry</button></div>;

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-130px)] sm:h-[calc(100vh-160px)] flex flex-col bg-white border border-slate-200 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm m-2 sm:m-0">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-3 sm:p-4 flex items-center justify-between">
        <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
          <button onClick={() => navigate(-1)} className="p-1.5 sm:p-2 hover:bg-slate-50 rounded-full transition-colors shrink-0">
            <ArrowLeft size={18} className="text-slate-500 sm:w-5 sm:h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800 text-sm sm:text-base truncate">Ride to {locationLabel(ride.destination)}</h2>
            <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest flex items-center">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1.5"></span> {chat.cancelledAt ? 'Cancelled · Read-only' : 'Ride Chat'}
            </p>
          </div>
        </div>
        <button aria-label="Refresh chat" disabled={busy} onClick={() => setReload(v => v + 1)} className="p-1.5 sm:p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-400 shrink-0">
          <RefreshCw size={18} className="sm:w-5 sm:h-5" />
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col items-center">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 sm:p-4 text-center max-w-sm">
            <Info size={16} className="text-bc-maroon mx-auto mb-1.5 sm:mb-2" />
            <p className="text-xs text-slate-500 font-medium">
              {chat.cancelledAt ? 'This ride is cancelled. Chat history is read-only.' : 'Coordinate your pickup here. Refresh to check for new messages.'}
            </p>
          </div>
        </div>

        {error && <p role="alert" className="text-red-700">{error}</p>}
        {!messages.length && <p className="text-center text-slate-500">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderUserId === user?.id ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 ${
              m.senderUserId === user?.id
              ? 'bg-bc-maroon text-white rounded-tr-none shadow-md shadow-bc-maroon/10' 
              : 'bg-slate-100 text-slate-700 rounded-tl-none border border-slate-200'
            }`}>
              {m.senderUserId !== user?.id && (
                <p className="text-[10px] font-bold text-bc-maroon mb-1 uppercase tracking-wider">{m.senderName}</p>
              )}
              <p className="text-xs sm:text-sm leading-relaxed">{m.body}</p>
              <p className={`text-[10px] mt-1 text-right ${m.senderUserId === user?.id ? 'text-white/60' : 'text-slate-400'}`}>
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
            aria-label="Message"
            maxLength={2000}
            disabled={busy || !!chat.cancelledAt}
            placeholder="Type your message..."
            className="w-full bg-white border border-slate-200 rounded-xl sm:rounded-2xl py-2.5 sm:py-3 pl-3.5 sm:pl-4 pr-12 sm:pr-14 font-medium text-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-bc-maroon/20 focus:border-bc-maroon transition-all"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button 
            type="submit"
            aria-label="Send message"
            disabled={busy || !!chat.cancelledAt || !input.trim()}
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

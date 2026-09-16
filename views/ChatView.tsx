import ChatMessages from '../src/components/ChatMessages';
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft } from 'lucide-react';
import { getChat, getRide, sendMessage, deleteMessage, reactMessage, ApiError } from '../src/api/rides';
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
  const pendingMessage=useRef<{body:string;id:string;rideId:string}|null>(null);
  const [connected,setConnected]=useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setChat(null); setRide(null); setLoading(true); setError('');
    (async () => {
      const history = await getChat(id!, controller.signal);
      const detail = await getRide(id!, controller.signal);
      if (!controller.signal.aborted && generation.current === current) { setChat(previous=>previous && BigInt(previous.revision)>BigInt(history.revision)?previous:history); setRide(detail); }
    })().catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); ++generation.current; };
  }, [id, user?.id, reload]);
  useEffect(()=>{
    if(!id || !user)return;
    const events=new EventSource('/api/rides/'+encodeURIComponent(id)+'/events');
    const abort=new AbortController();let fetching=false,queued=false;
    const update=async()=>{
      if(fetching){queued=true;return;}fetching=true;
      try{do{queued=false;const history=await getChat(id,abort.signal);if(!abort.signal.aborted){setChat(previous=>previous && BigInt(previous.revision)>BigInt(history.revision)?previous:history);setConnected(true);}}while(queued && !abort.signal.aborted);}
      catch(error){if(!abort.signal.aborted){setConnected(false);if(error instanceof ApiError && [401,403,404].includes(error.status)){setChat(null);events.close();}}}
      finally{fetching=false;}
    };
    events.addEventListener('changed',()=>void update());
    events.addEventListener('forbidden',()=>{abort.abort();setConnected(false);setChat(null);setError('Only current participants can access this chat.');events.close();});
    events.onerror=()=>setConnected(false);
    return()=>{events.close();abort.abort();};
  },[id,user?.id,reload]);
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
      if(!pendingMessage.current || pendingMessage.current.body!==input.trim() || pendingMessage.current.rideId!==id)pendingMessage.current={body:input.trim(),id:crypto.randomUUID(),rideId:id!};
      const updated = await sendMessage(id!, input.trim(),pendingMessage.current.id);
      pendingMessage.current=null;
      if (current === generation.current) { setChat(previous=>previous && BigInt(previous.revision)>BigInt(updated.revision)?previous:updated); setInput(''); }
    } catch (error) {
      if (current !== generation.current) return;
      setError(error instanceof Error ? error.message : 'Unable to send message.');
      if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setChat(null);
      if (error instanceof ApiError && error.status === 409) {
        try { const updated = await getChat(id!); if (current === generation.current) setChat(previous=>previous && BigInt(previous.revision)>BigInt(updated.revision)?previous:updated); }
        catch { if (current === generation.current) setChat(null); }
      }
    } finally { sending.current = false; setBusy(false); }
  };
  if (loading) return <p role="status" className="p-8 text-center">Loading chat...</p>;
  if (!chat || !ride) return <div className="p-8 text-center"><p role="alert">{error || 'Chat unavailable.'}</p><button onClick={() => setReload(v => v + 1)} className="underline">Retry</button></div>;

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-130px)] sm:h-[calc(100vh-160px)] flex flex-col bg-white border border-slate-200 rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm my-2 sm:my-6 w-[calc(100%-16px)]">
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
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <p className="text-xs text-neutral-500 text-center">Coordinate your pickup and luggage details here.</p>
        {chat.cancelledAt && <p className="text-xs text-neutral-500 text-center">This ride is cancelled. Chat history is read-only.</p>}

        {error && <p role="alert" className="text-red-700">{error}</p>}
        {!messages.length && <p className="text-center text-slate-500">No messages yet.</p>}
        <ChatMessages messages={messages} currentUserId={user?.id} readOnly={!!chat.cancelledAt} onDelete={async messageId=>{try{await deleteMessage(id!,messageId);}catch(error){setError(error instanceof Error?error.message:'Unable to delete.');}}} onReact={async(messageId,emoji,remove)=>{try{await reactMessage(id!,messageId,emoji,remove);}catch(error){setError(error instanceof Error?error.message:'Unable to react.');}}} />
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
            className="w-full bg-white border border-slate-200 rounded-xl sm:rounded-2xl py-2.5 sm:py-3 pl-3.5 sm:pl-4 pr-12 sm:pr-14 font-medium text-slate-700 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 focus:border-black transition-all"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button 
            type="submit"
            aria-label="Send message"
            disabled={busy || !!chat.cancelledAt || !input.trim()}
            className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-10 sm:h-10 bg-black text-white rounded-lg sm:rounded-xl flex items-center justify-center hover:bg-neutral-800 transition-all "
          >
            <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatView;

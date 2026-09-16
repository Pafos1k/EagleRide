import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { RideMessage } from '../../shared/messages';
import UserAvatar from './UserAvatar';

const quickReactions = ['❤️', '👍', '😂', '😮', '😢'];
type Props = { messages: RideMessage[]; currentUserId?: string; readOnly?: boolean;
  onDelete?: (id: string) => void; onReact?: (id: string, emoji: string, remove: boolean) => void };

export default function ChatMessages({ messages, currentUserId, onDelete, onReact, readOnly = false }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const press = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const point = useRef({ x: 0, y: 0 });
  const cancelPress = () => clearTimeout(press.current);
  const close = () => { setSelected(null); setConfirmDelete(false); opener.current?.focus(); };
  const open = (id: string, target: HTMLElement) => {
    if (readOnly) return;
    opener.current = target; setConfirmDelete(false); setSelected(id);
  };
  useEffect(() => () => clearTimeout(press.current), []);
  useEffect(() => {
    if (readOnly || (selected && !messages.some(message => message.id === selected))) {
      setSelected(null); setConfirmDelete(false);
    }
  }, [messages, readOnly, selected]);
  useEffect(() => {
    if (!selected) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    menu.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !opener.current?.contains(event.target as Node)) {
        setSelected(null); setConfirmDelete(false);
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [selected, confirmDelete]);

  return <div>{messages.map((message, index) => {
    const mine = message.senderUserId === currentUserId;
    const first = index === 0 || messages[index - 1].senderUserId !== message.senderUserId;
    const reactions = message.reactions ?? [];
    const active = reactions.find(reaction => reaction.userId === currentUserId)?.emoji;
    const counts = new Map<string, number>();
    reactions.forEach(reaction => counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1));
    const actionable = !readOnly && (!!onReact || (mine && !!onDelete));
    return <div key={message.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'} ${first ? 'mt-4' : 'mt-1'}`}>
      {!mine && <div className="w-8 shrink-0 self-start">{first && <a href={`#/profile/${encodeURIComponent(message.senderUserId)}`} aria-label={`View ${message.senderName} profile`}><UserAvatar name={message.senderName} url={message.senderAvatarUrl} /></a>}</div>}
      <div className="max-w-[65%] min-w-0 relative group">
        {!mine && first && <p className="text-xs font-semibold text-neutral-600 mb-1 break-words"><a href={`#/profile/${encodeURIComponent(message.senderUserId)}`} className="hover:underline">{message.senderName}</a></p>}
        <div role={actionable ? 'button' : undefined} tabIndex={actionable ? 0 : undefined}
          aria-label={actionable ? `Message: ${message.body}. Open message actions` : undefined}
          aria-haspopup={actionable ? 'dialog' : undefined} aria-expanded={actionable ? selected === message.id : undefined}
          onClick={event => { if (actionable) open(message.id, event.currentTarget); }}
          onKeyDown={event => { if (actionable && ['Enter', ' '].includes(event.key)) { event.preventDefault(); open(message.id, event.currentTarget); } }}
          onPointerDown={event => {
            if (!actionable || event.pointerType === 'mouse') return;
            cancelPress(); point.current = { x: event.clientX, y: event.clientY };
            const target = event.currentTarget;
            press.current = setTimeout(() => open(message.id, target), 450);
          }}
          onPointerMove={event => { if (Math.hypot(event.clientX - point.current.x, event.clientY - point.current.y) > 10) cancelPress(); }}
          onPointerUp={cancelPress} onPointerCancel={cancelPress}
          onContextMenu={event => { if (actionable) { event.preventDefault(); open(message.id, event.currentTarget); } }}
          className={`w-fit rounded-2xl px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${mine ? 'bg-black text-white ml-auto' : 'bg-neutral-100 text-neutral-900'}`}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>
          <time dateTime={message.createdAt} className={`block text-[10px] text-right mt-0.5 ${mine ? 'text-white/60' : 'text-neutral-500'}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time>
        </div>
        {actionable && <button aria-label="Message actions" aria-haspopup="dialog" aria-expanded={selected === message.id}
          onClick={event => open(message.id, event.currentTarget)}
          className={`absolute top-0 ${mine ? 'right-full' : 'left-full'} w-10 h-10 flex items-center justify-center rounded-full text-neutral-500 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-neutral-100`}>
          <MoreHorizontal size={18} />
        </button>}
        {counts.size > 0 && <div className={`flex flex-wrap gap-1 mt-0.5 text-[11px] ${mine ? 'justify-end' : ''}`}>
          {[...counts].map(([emoji, count]) => <button key={emoji} disabled={!actionable} aria-label={`${emoji}, ${count} reactions`} aria-pressed={active === emoji}
            onClick={event => open(message.id, event.currentTarget)}
            className={`rounded-full px-2 py-0.5 border ${active === emoji ? 'border-neutral-400 bg-neutral-200' : 'border-neutral-200 bg-neutral-50'}`}>{emoji} {count}</button>)}
        </div>}
        {selected === message.id && actionable && <div ref={menu} role="dialog" aria-label={confirmDelete ? 'Delete message?' : 'Message actions'}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            if (event.key === 'Tab') {
              const buttons = menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
              if (!buttons?.length) return;
              const first = buttons[0], last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
          }}
          className={`absolute z-20 top-full mt-1 ${mine ? 'right-0' : 'left-0'} w-60 rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-lg p-2`}>
          {confirmDelete ? <>
            <p className="font-semibold px-2 pt-1">Delete message?</p>
            <p className="text-xs text-neutral-500 px-2 py-2">This message will be removed for everyone.</p>
            <div className="flex gap-2">
              <button className="flex-1 min-h-11 rounded-xl border border-neutral-200" onClick={close}>Cancel</button>
              <button className="flex-1 min-h-11 rounded-xl bg-black text-white font-semibold" onClick={() => { close(); onDelete?.(message.id); }}>Delete</button>
            </div>
          </> : <>
            {onReact && <div className="flex" aria-label="Quick reactions">{quickReactions.map(emoji => <button key={emoji} aria-label={`React ${emoji}`} aria-pressed={active === emoji}
              className={`flex-1 min-w-0 min-h-11 text-xl rounded-xl hover:bg-neutral-100 ${active === emoji ? 'bg-neutral-200 ring-1 ring-inset ring-neutral-400' : ''}`}
              onClick={() => { close(); onReact(message.id, emoji, active === emoji); }}>{emoji}</button>)}</div>}
            {onReact && active && !quickReactions.includes(active) && <button aria-pressed="true" className="w-full min-h-11 rounded-xl bg-neutral-100 text-sm" onClick={() => { close(); onReact(message.id, active, true); }}>Remove {active} reaction</button>}
            {mine && onDelete && <button className="w-full min-h-11 text-sm text-left px-3 rounded-xl hover:bg-neutral-100" onClick={() => setConfirmDelete(true)}>Delete message</button>}
          </>}
        </div>}
      </div>
    </div>;
  })}</div>;
}

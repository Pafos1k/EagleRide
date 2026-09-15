import React from 'react';
import type { RideMessage } from '../../shared/messages';
import UserAvatar from './UserAvatar';
export default function ChatMessages({messages,currentUserId,onDelete,onReact,readOnly=false}:{messages:RideMessage[];currentUserId?:string;readOnly?:boolean;onDelete?:(id:string)=>void;onReact?:(id:string,emoji:string,remove:boolean)=>void}) {
  return <div>{messages.map((message,index)=>{
    const mine=message.senderUserId===currentUserId;
    const first=index===0 || messages[index-1].senderUserId!==message.senderUserId;
    return <div key={message.id} className={`flex items-end gap-2 ${mine?'justify-end':'justify-start'} ${first?'mt-4':'mt-1'}`}>
      {!mine && <div className="w-8 shrink-0 self-start">{first && <UserAvatar name={message.senderName} url={message.senderAvatarUrl} />}</div>}
      <div className="max-w-[65%] min-w-0">
        {!mine && first && <p className="text-xs font-semibold text-neutral-600 mb-1 break-words">{message.senderName}</p>}
        <div className={`w-fit rounded-2xl px-3 py-2 ${mine?'bg-black text-white ml-auto':'bg-neutral-100 text-neutral-900'}`}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>
          <time dateTime={message.createdAt} className={`block text-[10px] text-right mt-0.5 ${mine?'text-white/60':'text-neutral-500'}`}>{new Date(message.createdAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</time>
        </div>
        <div className="flex flex-wrap gap-1 mt-1 text-xs">
          {['👍','❤️','😂','🎉','👀'].map(emoji=>{
            const reactions=(message.reactions??[]).filter(r=>r.emoji===emoji);const mine=reactions.some(r=>r.userId===currentUserId);
            return onReact && <button key={emoji} disabled={readOnly} aria-label={`React ${emoji}`} aria-pressed={mine} className={`rounded-full px-1.5 py-0.5 ${mine?'bg-neutral-300':'bg-neutral-50'}`} onClick={()=>onReact(message.id,emoji,mine)}>{emoji}{reactions.length>0?' '+reactions.length:''}</button>;
          })}
          {mine && onDelete && <button disabled={readOnly} className="underline text-neutral-500 ml-1" onClick={()=>onDelete(message.id)}>Delete</button>}
        </div>
      </div>
    </div>;
  })}</div>;
}

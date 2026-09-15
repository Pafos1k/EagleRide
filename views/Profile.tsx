import UserAvatar from '../src/components/UserAvatar';
import React, { useEffect, useRef, useState } from 'react';
import { Mail, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/auth/AuthProvider';
import { profileInput } from '../shared/profile';

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!photo) { setPreview(undefined); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  if (!user) return null;
  return <div className="max-w-4xl mx-auto px-4 py-8">
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
      <form className="flex flex-col sm:flex-row items-center gap-6" onSubmit={async event => {
        event.preventDefault(); if(busy || !editing) return;
        const parsed = profileInput.safeParse({fullName:name});
        if(!parsed.success) { setError('Enter a plain-text display name of 1–80 characters.'); return; }
        setBusy(true); setError('');
        try {
          if(photo) {
            const upload = await fetch('/api/auth/profile/avatar',{method:'POST',headers:{'Content-Type':photo.type},body:photo});
            if(!upload.ok) { const result=await upload.json(); throw new Error(result.error || 'Unable to upload photo.'); }
          }
          const response = await fetch('/api/auth/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed.data)});
          const result=await response.json(); if(!response.ok) throw new Error(result.error || 'Unable to save profile.');
          await refresh(); setEditing(false); setPhoto(null);
        } catch(error) { setError(error instanceof Error ? error.message : 'Unable to save profile.'); }
        finally { setBusy(false); }
      }}>
        <div className="flex flex-col items-center gap-3">
          <UserAvatar name={user.fullName} url={preview ?? user.avatarUrl} className="w-24 h-24 text-3xl" />
          {editing && <>
            <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose profile photo" className="hidden" disabled={busy} onChange={event=>{
              const file=event.target.files?.[0]; event.target.value=''; if(!file) return;
              if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>2*1024*1024 || !file.size) { setError('Choose a PNG, JPEG, or WebP image up to 2 MB.'); return; }
              setError(''); setPhoto(file);
            }} />
            <button type="button" disabled={busy} className="underline text-sm" onClick={()=>picker.current?.click()}>Change photo</button>
          </>}
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left space-y-3 w-full">
          {editing ? <label className="block text-sm">Display name<input disabled={busy} className="block w-full border rounded-lg p-2 mt-1" required maxLength={80} value={name} onChange={event=>setName(event.target.value)} /></label> : <h1 className="text-3xl font-black text-slate-900 break-words">{user.fullName}</h1>}
          <p className="text-slate-500 break-all"><Mail className="inline mr-2" size={16} />{user.bcEmail}</p>
          <p className="text-emerald-700 text-sm"><ShieldCheck className="inline mr-2" size={16} />Verified BC email</p>
          <p className="text-xs text-slate-500">Email ownership does not verify current student enrollment.</p>
          {error && <p role="alert">{error}</p>}
          {editing ? <div className="flex gap-3 justify-center sm:justify-start">
            <button disabled={busy} className="bg-black text-white rounded-lg px-5 py-2">{busy ? 'Saving...' : 'Save'}</button>
            <button type="button" disabled={busy} className="px-4 py-2 underline" onClick={()=>{setEditing(false);setPhoto(null);setError('');}}>Cancel</button>
          </div> : <button type="button" className="bg-black text-white rounded-lg px-5 py-2" onClick={()=>{setName(user.fullName);setPhoto(null);setError('');setEditing(true);}}>Edit profile</button>}
        </div>
      </form>
      <div className="mt-6 pt-5 border-t border-neutral-100">
        <button disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-xl text-neutral-700 bg-slate-50 font-bold" onClick={async()=>{
          setBusy(true);try{await signOut();}catch{}finally{setBusy(false);navigate('/signin');}
        }}><LogOut size={18} />Sign Out</button>
      </div>
    </div>
  </div>;
}

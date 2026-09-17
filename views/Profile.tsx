import { getPublicProfile } from '../src/api/rides';
import type { PublicProfile } from '../shared/reputation';
import ReputationSummary from '../src/components/ReputationSummary';
import UserAvatar from '../src/components/UserAvatar';
import React, { useEffect, useRef, useState } from 'react';
import { Camera, Mail, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../src/auth/AuthProvider';
import { profileInput } from '../shared/profile';

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const {userId}=useParams();
  const readOnly=Boolean(userId && userId!==user?.id);
  const [publicProfile,setPublicProfile]=useState<PublicProfile>();
  const [profileError,setProfileError]=useState('');
  const profileId=userId??user?.id;
  useEffect(()=>{
    setPublicProfile(undefined);setProfileError('');setEditing(false);setPhoto(null);setError('');
    if(!profileId)return;
    const controller=new AbortController();
    getPublicProfile(profileId,controller.signal).then(setPublicProfile).catch(error=>{if(!controller.signal.aborted)setProfileError(error.message);});
    return()=>controller.abort();
  },[profileId]);
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
  const displayed=readOnly?publicProfile:user;
  if(!displayed)return <div className="max-w-[540px] mx-auto p-8 text-center"><p role={profileError?'alert':'status'}>{profileError||'Loading profile...'}</p></div>;
  return <div className="max-w-[540px] mx-auto px-4 py-8 sm:py-12">
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
      <form className="flex flex-col items-center gap-5" onSubmit={async event => {
        event.preventDefault(); if(readOnly || busy || !editing) return;
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
          <UserAvatar name={displayed.fullName} url={readOnly?displayed.avatarUrl:preview ?? displayed.avatarUrl} className="w-32 h-32 sm:w-36 sm:h-36 text-4xl" />
          {!readOnly && editing && <>
            <input ref={picker} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose profile photo" className="hidden" disabled={busy} onChange={event=>{
              const file=event.target.files?.[0]; event.target.value=''; if(!file) return;
              if(!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>2*1024*1024 || !file.size) { setError('Choose a PNG, JPEG, or WebP image up to 2 MB.'); return; }
              setError(''); setPhoto(file);
            }} />
            <button type="button" disabled={busy} className="inline-flex items-center justify-center gap-2 border border-slate-200 bg-slate-50 rounded-xl px-4 py-2 text-sm font-semibold" onClick={()=>picker.current?.click()}><Camera size={18} />Change photo</button>
          </>}
        </div>
        <div className="flex-1 min-w-0 text-center space-y-3 w-full">
          {!readOnly && editing ? <label className="block text-sm">Display name<input disabled={busy} className="block w-full border rounded-lg p-2 mt-1 text-center" required maxLength={80} value={name} onChange={event=>setName(event.target.value)} /></label> : <h1 className="text-3xl font-black text-slate-900 break-words">{displayed.fullName}</h1>}
          {!readOnly && <><p className="text-slate-500 break-all"><Mail className="inline mr-2" size={16} />{user?.bcEmail}</p>
          <p className="text-emerald-700 text-sm"><ShieldCheck className="inline mr-2" size={16} />Verified BC email</p>
          <p className="text-xs text-slate-500">Email ownership does not verify current student enrollment.</p></>}
          {publicProfile && <ReputationSummary reputation={publicProfile.reputation} />}
          {profileError && <p role="alert" className="text-sm">{profileError}</p>}
          {error && <p role="alert">{error}</p>}
          {!readOnly && (editing ? <div className="grid grid-cols-2 gap-3 !mt-5">
            <button disabled={busy} className="w-full bg-black text-white rounded-xl px-4 py-3 font-semibold">{busy ? 'Saving...' : 'Save'}</button>
            <button type="button" disabled={busy} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-semibold" onClick={()=>{setEditing(false);setPhoto(null);setError('');}}>Cancel</button>
          </div> : <button type="button" className="w-full bg-black text-white rounded-xl px-5 py-3 !mt-5" onClick={()=>{setName(displayed.fullName);setPhoto(null);setError('');setEditing(true);}}>Edit profile</button>)}
        </div>
      </form>
      {!readOnly && !editing && <div className="mt-3">
        <button disabled={busy} className="flex w-full items-center justify-center gap-2 px-4 py-3 border border-slate-200 rounded-xl text-neutral-700 bg-slate-50 font-bold" onClick={async()=>{
          const signOutFrom = window.location.href;
          setBusy(true);try{await signOut();}catch{}finally{
            setBusy(false);
            // A delayed logout must not override navigation to a public page.
            if (window.location.href === signOutFrom) navigate('/signin');
          }
        }}><LogOut size={18} />Sign Out</button>
      </div>}
    </div>
  </div>;
}

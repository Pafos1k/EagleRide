import UserAvatar from '../src/components/UserAvatar';
import React, { useState } from 'react';
import { Mail, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/auth/AuthProvider';

export default function Profile() {
  const { user, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [error, setError] = useState('');
  if (!user) return null;
  return <div className="max-w-4xl mx-auto px-4 py-8">
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-center gap-6">
      <UserAvatar name={user.fullName} url={user.avatarUrl} className="w-24 h-24 text-3xl" />
      <div className="flex-1 min-w-0 text-center md:text-left space-y-3">
        {!editing && <button className="underline text-sm" onClick={() => { setName(user.fullName); setAvatar(user.avatarUrl ?? ''); setError(''); setEditing(true); }}>Edit profile</button>}
        {editing && <form className="space-y-3" onSubmit={async event => {
          event.preventDefault(); setBusy(true); setError('');
          try {
            const response = await fetch('/api/auth/profile', { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fullName:name,avatarUrl:avatar.trim() || null}) });
            const result = await response.json(); if(!response.ok) throw new Error(result.error || 'Unable to save profile.');
            await refresh(); setEditing(false);
          } catch(error) { setError(error instanceof Error ? error.message : 'Unable to save profile.'); }
          finally { setBusy(false); }
        }}>
          <label className="block text-sm">Display name<input className="block w-full border rounded-lg p-2" required maxLength={80} value={name} onChange={event=>setName(event.target.value)} /></label>
          <label className="block text-sm">Avatar image URL<input className="block w-full border rounded-lg p-2" type="url" maxLength={2048} placeholder="https://" value={avatar} onChange={event=>setAvatar(event.target.value)} /></label>
          <p className="text-xs text-neutral-500">Use an HTTPS image link. Leave blank to show initials. Images load from the linked website.</p>
          {error && <p role="alert">{error}</p>}
          <button disabled={busy} className="bg-black text-white rounded-lg px-4 py-2">Save profile</button>
          <button type="button" disabled={busy} className="ml-3 underline" onClick={()=>setEditing(false)}>Cancel</button>
        </form>}
        <h1 className="text-3xl font-black text-slate-900">{user.fullName}</h1>
        <p className="text-slate-500 break-all"><Mail className="inline mr-2" size={16} />{user.bcEmail}</p>
        <p className="text-emerald-700 text-sm"><ShieldCheck className="inline mr-2" size={16} />Verified BC email</p>
        <p className="text-xs text-slate-500">Email ownership does not verify current student enrollment.</p>
      </div>
      <button disabled={busy} className="flex items-center gap-2 px-6 py-3 rounded-xl text-red-600 bg-slate-50 font-bold" onClick={async () => {
        setBusy(true);
        try { await signOut(); } catch { /* AuthProvider shows the exact logout limitation on sign-in. */ }
        finally { setBusy(false); navigate('/signin'); }
      }}><LogOut size={18} />{busy ? 'Signing out...' : 'Sign Out'}</button>
    </div>
  </div>;
}

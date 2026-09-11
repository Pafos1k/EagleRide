import React, { useState } from 'react';
import { Mail, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../src/auth/AuthProvider';

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return <div className="max-w-4xl mx-auto px-4 py-8">
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-center gap-6">
      <div className="w-24 h-24 bg-bc-gold rounded-full flex items-center justify-center text-white text-3xl font-black">{user.fullName.split(/\s+/).slice(0, 2).map(part => part[0]).join('')}</div>
      <div className="flex-1 min-w-0 text-center md:text-left space-y-3">
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

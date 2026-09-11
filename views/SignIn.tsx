import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../src/auth/AuthProvider';

export default function SignIn() {
  const { user, loading, error: authError, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const callbackError = new URLSearchParams(useLocation().search).get('error');
  async function signIn() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/login', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Unable to start sign-in.');
      window.location.assign(data.url);
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to start sign-in.'); setBusy(false); }
  }
  return <div className="max-w-lg mx-auto px-6 py-16 space-y-6">
    <h1 className="text-3xl font-bold">Sign in to EagleRide</h1>
    <p className="text-neutral-500">Use a verified @bc.edu email account. This confirms mailbox ownership, not current student enrollment.</p>
    {(error || callbackError || authError) && <p role="alert" className="text-red-700">{error || (callbackError === '403' ? 'A verified @bc.edu email account is required.' : callbackError ? 'Sign-in could not be completed. Please try again.' : authError)}</p>}
    {loading ? <p role="status">Checking sign-in...</p> : user ? <Link to="/profile" className="underline">Continue as {user.fullName}</Link> : <button disabled={busy} onClick={signIn} className="w-full bg-black text-white py-3 rounded-xl font-bold">{busy ? 'Opening Google...' : 'Continue with Google'}</button>}
    {authError && <button className="block underline" onClick={async () => { try { await signOut(); } catch { /* Context displays the error and keeps retry available. */ } }}>Retry sign out</button>}
    <Link className="block underline" to="/find">Browse rides without signing in</Link>
  </div>;
}

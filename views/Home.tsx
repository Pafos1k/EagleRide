import React from 'react';
import { Link } from 'react-router-dom';
export default function Home() {
  return <div className="max-w-3xl mx-auto px-6 py-16 space-y-6 text-center">
    <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">EagleRide</h1>
    <p className="text-neutral-500 text-lg">Find a ride with the BC community. Browse without signing in.</p>
    <div className="flex flex-wrap gap-4 justify-center">
      <Link to="/find" className="rounded-xl bg-black text-white px-6 py-3 font-bold">Find Rides</Link>
      <Link to="/create" className="rounded-xl border border-neutral-300 px-6 py-3 font-bold">Create Ride</Link>
      <Link to="/about" className="rounded-xl px-6 py-3 underline">About</Link>
    </div>
  </div>;
}

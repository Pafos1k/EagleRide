
import React from 'react';
import { 
  ShieldCheck, 
  Car, 
  History, 
  LogOut, 
  Settings,
  Mail,
  Phone,
  Award
} from 'lucide-react';
import { CURRENT_USER } from '../store';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const reliabilityData = [
  { name: 'Sept', score: 92 },
  { name: 'Oct', score: 95 },
  { name: 'Nov', score: 97 },
  { name: 'Dec', score: 98 },
];

const Profile: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 px-4 sm:px-6 lg:px-0 py-6 sm:py-8">
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-center gap-6 sm:gap-8">
        <div className="w-24 h-24 sm:w-32 sm:h-32 bg-bc-gold rounded-full flex items-center justify-center text-white text-3xl sm:text-4xl font-black shadow-xl border-4 border-slate-50 shrink-0">
          BE
        </div>
        <div className="flex-1 text-center md:text-left min-w-0">
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">{CURRENT_USER.fullName}</h1>
          <p className="text-slate-500 font-medium mb-3 sm:mb-4 text-sm sm:text-base break-all">{CURRENT_USER.bcEmail}</p>
          <div className="flex flex-wrap justify-center md:justify-start gap-2">
            <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center">
              <ShieldCheck size={14} className="mr-1.5" /> High Reliability
            </span>
            <span className="bg-bc-maroon/5 text-bc-maroon px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center">
              <Award size={14} className="mr-1.5" /> Super Eagle
            </span>
          </div>
        </div>
        <div className="flex flex-col space-y-2 w-full md:w-auto shrink-0">
          <button className="flex items-center justify-center space-x-2 bg-slate-50 text-slate-600 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold hover:bg-slate-100 transition-all border border-slate-200 text-sm sm:text-base">
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <button className="flex items-center justify-center space-x-2 bg-slate-50 text-red-600 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl font-bold hover:bg-red-50 transition-all border border-red-100 text-sm sm:text-base">
            <LogOut size={18} />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <ShieldCheck size={20} className="text-bc-maroon" />
            <h2 className="font-bold text-slate-800">Reliability</h2>
          </div>
          <p className="text-3xl sm:text-4xl font-black bc-maroon mb-1">{CURRENT_USER.reliabilityScore}</p>
          <p className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-widest">Global Ranking: Top 5%</p>
          
          <div className="h-32 mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reliabilityData}>
                <Bar dataKey="score">
                  {reliabilityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === reliabilityData.length - 1 ? '#8a2432' : '#f1f5f9'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <Car size={20} className="text-bc-maroon" />
            <h2 className="font-bold text-slate-800">Ride History</h2>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">Completed</span>
              <span className="font-bold text-slate-800">{CURRENT_USER.completedRidesCount}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">Cancelled</span>
              <span className="font-bold text-slate-800">{CURRENT_USER.cancelledRidesCount}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">No-shows</span>
              <span className="font-bold text-emerald-600">0</span>
            </div>
          </div>
          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-100">
            <div className="bg-bc-maroon/5 rounded-2xl p-3 sm:p-4">
               <p className="text-xs text-bc-maroon font-bold text-center">Estimated Savings: $340.00</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-4">
            <History size={20} className="text-bc-maroon" />
            <h2 className="font-bold text-slate-800">Contact Info</h2>
          </div>
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center space-x-3 text-slate-600 min-w-0">
              <Mail size={18} className="text-slate-400 shrink-0" />
              <span className="text-xs sm:text-sm font-medium truncate">{CURRENT_USER.bcEmail}</span>
            </div>
            <div className="flex items-center space-x-3 text-slate-600 min-w-0">
              <Phone size={18} className="text-slate-400 shrink-0" />
              <span className="text-xs sm:text-sm font-medium truncate">{CURRENT_USER.phoneNumber}</span>
            </div>
          </div>
          <div className="mt-8 sm:mt-12 bg-slate-900 rounded-2xl p-4 text-white">
            <p className="text-[10px] font-bold text-bc-gold uppercase tracking-widest mb-1">Eagle Tip</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              Maintain your reliability score above 90 to get early access to holiday rides!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

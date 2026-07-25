import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  Sparkles, 
  UserCheck, 
  MessageSquare, 
  CheckCircle2, 
  XCircle, 
  ArrowRight,
  MapPin
} from 'lucide-react';
import { API_BASE_URL } from '../api/client';

export const HomeDashboard = () => {
  const { userProfile, username } = useAuth();

  const getProfilePictureUrl = () => {
    if (userProfile && userProfile.profile_picture) {
      if (userProfile.profile_picture.startsWith('http')) return userProfile.profile_picture;
      return `${API_BASE_URL}${userProfile.profile_picture}`;
    }
    return null;
  };

  const avatarUrl = getProfilePictureUrl();
  const completion = userProfile?.profile_completion || { percentage: 0, breakdown: {} };

  const stats = [
    {
      label: 'City Location',
      value: userProfile?.city || 'Not Set',
      icon: MapPin,
      color: 'text-indigo-400'
    }
  ];

  return (
    <div className="space-y-8 text-left">
      {/* Welcome Banner */}
      <div className="glass-panel p-6 md:p-8 rounded-3xl border border-[#F4C0D1] dark:border-brand-purple/15 flex flex-col md:flex-row items-center justify-between gap-6 bg-white dark:bg-brand-dark/20 relative overflow-hidden transition-colors duration-200">
        <div className="absolute top-[-50px] right-[-50px] w-48 h-48 rounded-full bg-[#D4537E]/10 dark:bg-brand-purple/10 blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-5">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={userProfile?.full_name || username}
              className="w-16 h-16 rounded-full object-cover border-2 border-[#D4537E]/30 dark:border-brand-purple/30 shadow-lg"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#D4537E]/15 dark:bg-brand-purple/20 flex items-center justify-center border-2 border-[#D4537E]/30 dark:border-brand-purple/30 text-[#D4537E] dark:text-brand-purple-light text-xl font-bold uppercase">
              {username ? username.substring(0, 2) : 'CK'}
            </div>
          )}
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#2C2C2A] dark:text-slate-100 font-display">
              Hello, {userProfile?.full_name?.split(' ')[0] || username}!
            </h2>
            <p className="text-[#5F5E5A] dark:text-slate-400 text-sm mt-1">
              Welcome back to your Lynqo dashboard. Connect Beyond Chats.
            </p>
          </div>
        </div>

        <Link
          to="/suggestions"
          className="flex items-center gap-2 bg-[#D4537E] hover:bg-[#c2436d] dark:bg-brand-purple dark:hover:bg-brand-purple-dark text-white px-5 py-3 rounded-2xl text-sm font-bold transition-all duration-300 shadow-lg shadow-[#D4537E]/20 dark:shadow-brand-purple/20 border border-transparent dark:border-brand-purple-light/20 cursor-pointer flex-shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          <span>Explore Suggestions</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 gap-6">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="glass-panel p-6 rounded-2xl border border-[#F4C0D1] dark:border-brand-purple/10 flex items-center gap-4 bg-white dark:bg-brand-dark/10">
              <div className={`p-3 rounded-xl bg-[#FCEEF3] dark:bg-brand-black/40 border border-[#F4C0D1] dark:border-slate-800 ${stat.color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-extrabold text-[#5F5E5A] dark:text-slate-500 uppercase tracking-widest">{stat.label}</div>
                <div className="text-[#2C2C2A] dark:text-slate-200 font-bold text-base mt-0.5">{stat.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Completion Box */}
        <div className="lg:col-span-2 glass-panel p-6 md:p-8 rounded-3xl border border-[#F4C0D1] dark:border-brand-purple/10 bg-white dark:bg-brand-dark/10 flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-bold font-display text-[#2C2C2A] dark:text-slate-100 mb-2">Profile Setup Checklist</h3>
            <p className="text-xs text-[#5F5E5A] dark:text-slate-400 mb-6">Complete your profile elements to fetch recommendations.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Object.entries(completion.breakdown || {}).map(([field, completed]) => (
                <div
                  key={field}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border text-xs font-semibold ${
                    completed
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {completed ? (
                    <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-4.5 h-4.5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                  )}
                  <span>{field}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 flex flex-col sm:flex-row items-center gap-5 border-t border-[#F4C0D1] dark:border-slate-900 pt-6">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-pink-200 dark:text-slate-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#D4537E] dark:text-brand-purple"
                  strokeWidth="3.5"
                  strokeDasharray={`${completion.percentage}, 100`}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-[#2C2C2A] dark:text-slate-200">
                {completion.percentage}%
              </div>
            </div>
            
            <div className="text-center sm:text-left flex-grow">
              <div className="text-sm font-bold text-[#2C2C2A] dark:text-slate-300">
                {completion.percentage === 100 ? 'Your profile is complete!' : 'Finish your profile setup'}
              </div>
              <div className="text-xs text-[#5F5E5A] dark:text-slate-500 mt-1">
                {completion.percentage === 100 
                  ? 'Excellent job! You are visible to all matching users nearby.'
                  : 'Add a profile picture and city to reach 100%.'}
              </div>
            </div>

            {completion.percentage < 100 && (
              <Link
                to="/settings"
                className="text-xs font-bold text-[#D4537E] dark:text-brand-purple-light hover:underline flex items-center gap-1 cursor-pointer select-none"
              >
                <span>Edit Profile</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Quick Links Box */}
        <div className="glass-panel p-6 rounded-3xl border border-[#F4C0D1] dark:border-brand-purple/10 bg-white dark:bg-brand-dark/10 flex flex-col justify-between">
          <h3 className="text-lg font-bold font-display text-[#2C2C2A] dark:text-slate-100 mb-2">Connect Hub</h3>
          <p className="text-xs text-[#5F5E5A] dark:text-slate-400 mb-6">Manage conversations and pending connection invitations.</p>

          <div className="flex flex-col gap-3">
            <Link
              to="/requests"
              className="flex items-center justify-between p-4 rounded-2xl bg-[#FCEEF3]/70 dark:bg-brand-black/50 border border-[#F4C0D1] dark:border-slate-800 hover:border-[#D4537E]/40 dark:hover:border-brand-purple/40 hover:bg-[#D4537E]/5 dark:hover:bg-brand-purple/5 transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span className="text-sm font-bold text-[#2C2C2A] dark:text-slate-200">Pending Invites</span>
              </div>
              <ArrowRight className="w-4 h-4 text-[#5F5E5A] dark:text-slate-500" />
            </Link>

            <Link
              to="/conversations"
              className="flex items-center justify-between p-4 rounded-2xl bg-[#FCEEF3]/70 dark:bg-brand-black/50 border border-[#F4C0D1] dark:border-slate-800 hover:border-[#D4537E]/40 dark:hover:border-brand-purple/40 hover:bg-[#D4537E]/5 dark:hover:bg-brand-purple/5 transition-all duration-200 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-[#D4537E] dark:text-purple-400" />
                <span className="text-sm font-bold text-[#2C2C2A] dark:text-slate-200">My Conversations</span>
              </div>
              <ArrowRight className="w-4 h-4 text-[#5F5E5A] dark:text-slate-500" />
            </Link>
          </div>

          <div className="mt-8 p-4 bg-[#FCEEF3]/50 dark:bg-brand-black/30 border border-[#F4C0D1] dark:border-slate-900 rounded-2xl text-[11px] text-[#5F5E5A] dark:text-slate-500 font-semibold leading-relaxed">
            Note: Lynqo enforces strict invitation approval before opening messaging. Send connect requests to chat!
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeDashboard;

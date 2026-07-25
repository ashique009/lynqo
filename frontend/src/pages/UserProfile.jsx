import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import { MapPin, Mail, Phone, Edit3 } from 'lucide-react';
import { API_BASE_URL } from '../api/client';

export const UserProfile = () => {
  const { userProfile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(!userProfile);
  const { showToast } = useToast();

  useEffect(() => {
    const loadProfile = async () => {
      try {
        await refreshProfile();
      } catch (err) {
        showToast('Failed to load profile details.', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const getProfilePictureUrl = () => {
    if (userProfile && userProfile.profile_picture) {
      if (userProfile.profile_picture.startsWith('http')) return userProfile.profile_picture;
      return `${API_BASE_URL}${userProfile.profile_picture}`;
    }
    return null;
  };

  if (loading) {
    return <Loader />;
  }

  if (!userProfile) {
    return (
      <div className="text-center py-12">
        <h3 className="text-xl font-bold text-slate-200">No profile found</h3>
        <p className="text-sm text-slate-500 mt-2">Create your profile details in settings.</p>
        <Link to="/settings" className="mt-4 inline-block bg-brand-purple text-white px-4 py-2 rounded-xl text-xs font-bold">
          Go to Settings
        </Link>
      </div>
    );
  }

  const avatar = getProfilePictureUrl();

  return (
    <div className="space-y-6 text-left max-w-3xl mx-auto">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-extrabold font-display text-[#2C2C2A] dark:text-slate-100">My Profile</h2>
        <Link
          to="/settings"
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-[#D4537E]/15 hover:bg-[#D4537E] dark:bg-brand-purple/20 dark:hover:bg-brand-purple text-[#D4537E] hover:text-white dark:text-brand-purple-light dark:hover:text-white border border-[#D4537E]/30 dark:border-brand-purple/30 rounded-xl transition-all duration-300 cursor-pointer"
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Edit Profile</span>
        </Link>
      </div>

      <div className="glass-panel p-8 rounded-3xl border border-[#F4C0D1] dark:border-brand-purple/10 bg-white dark:bg-brand-dark/20 text-center flex flex-col items-center transition-colors duration-200">
        {avatar ? (
          <img
            src={avatar}
            alt={userProfile.full_name}
            className="w-32 h-32 rounded-full object-cover border-2 border-[#D4537E]/30 dark:border-brand-purple/30 shadow-xl"
          />
        ) : (
          <div className="w-32 h-32 rounded-full bg-[#D4537E]/10 dark:bg-brand-purple/10 flex items-center justify-center border-2 border-[#D4537E]/20 dark:border-brand-purple/20 text-[#D4537E] dark:text-brand-purple-light text-3xl font-extrabold uppercase">
            {userProfile.username ? userProfile.username.substring(0, 2) : 'CK'}
          </div>
        )}

        <h3 className="text-xl font-bold text-[#2C2C2A] dark:text-slate-200 mt-4 font-display">
          {userProfile.full_name}
        </h3>
        <p className="text-xs text-[#5F5E5A] dark:text-slate-500 font-semibold mt-0.5">@{userProfile.username}</p>

        <div className="mt-8 w-full max-w-md border-t border-[#F4C0D1] dark:border-slate-900 pt-6 space-y-4 text-left">
          <div className="flex items-center gap-3 text-[#5F5E5A] dark:text-slate-400">
            <Mail className="w-4 h-4 text-[#5F5E5A] dark:text-slate-500" />
            <span className="text-xs font-medium">{userProfile.email}</span>
          </div>
          {userProfile.phone && (
            <div className="flex items-center gap-3 text-[#5F5E5A] dark:text-slate-400">
              <Phone className="w-4 h-4 text-[#5F5E5A] dark:text-slate-500" />
              <span className="text-xs font-medium">{userProfile.phone}</span>
            </div>
          )}
          {userProfile.city && (
            <div className="flex items-center gap-3 text-[#5F5E5A] dark:text-slate-400">
              <MapPin className="w-4 h-4 text-[#5F5E5A] dark:text-slate-500" />
              <span className="text-xs font-medium">{userProfile.city}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { profileService } from '../services/profileService';
import { Upload, ChevronRight } from 'lucide-react';

export const ProfileSetup = () => {
  const { refreshProfile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // State fields
  const [profilePicture, setProfilePicture] = useState(null);
  const [picturePreview, setPicturePreview] = useState(null);
  const [city, setCity] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePictureChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfilePicture(file);
      setPicturePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setLoading(true);

    const payload = {
      city: city.trim(),
    };

    if (profilePicture) {
      payload.profile_picture = profilePicture;
    }

    try {
      const response = await profileService.createProfile(payload);
      if (response.success) {
        showToast('Profile setup complete!', 'success');
        await refreshProfile();
        navigate('/dashboard');
      } else {
        showToast(response.message || 'Failed to complete profile.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'An error occurred during profile creation.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-130px)] flex items-center justify-center py-6">
      <div className="w-full max-w-2xl glass-panel p-6 md:p-10 rounded-3xl shadow-2xl bg-white dark:bg-brand-dark/40 border border-[#F4C0D1] dark:border-brand-purple/20 transition-colors duration-200">
        <h2 className="text-3xl font-bold font-display text-[#2C2C2A] dark:text-slate-100 mb-2">
          Setup Your Profile
        </h2>
        <p className="text-[#5F5E5A] dark:text-slate-400 text-sm mb-8">
          Add your profile picture and city to get started on Lynqo.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Avatar Upload */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-28 h-28 rounded-full border-2 border-dashed border-[#D4537E]/40 hover:border-[#D4537E] dark:border-brand-purple/40 dark:hover:border-brand-purple flex items-center justify-center overflow-hidden bg-[#FCEEF3] dark:bg-brand-black/30 group transition-all duration-300">
              {picturePreview ? (
                <img
                  src={picturePreview}
                  alt="Avatar Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center text-[#5F5E5A] dark:text-slate-500 group-hover:text-[#D4537E] dark:group-hover:text-brand-purple-light transition-colors">
                  <Upload className="w-6 h-6 mb-1" />
                  <span className="text-[10px] font-bold uppercase">Upload</span>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handlePictureChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
                disabled={loading}
              />
            </div>
            <span className="text-xs font-semibold text-[#5F5E5A] dark:text-slate-400">Profile Picture (Recommended)</span>
          </div>

          {/* City Detail */}
          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs font-semibold text-[#5F5E5A] dark:text-slate-400">City</label>
            <input
              type="text"
              className="glass-input p-3 rounded-xl text-sm w-full"
              placeholder="Enter your city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full mt-4 bg-[#D4537E] hover:bg-[#c2436d] dark:bg-gradient-to-r dark:from-brand-purple dark:to-indigo-600 dark:hover:from-brand-purple-dark dark:hover:to-indigo-700 text-white font-bold py-4 rounded-2xl transition-all duration-300 shadow-xl shadow-[#D4537E]/20 dark:shadow-brand-purple/25 border border-transparent dark:border-brand-purple-light/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading}
          >
            {loading ? (
              <div className="w-6 h-6 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
            ) : (
              <>
                <span>Complete Profile Setup</span>
                <ChevronRight className="w-5 h-5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProfileSetup;

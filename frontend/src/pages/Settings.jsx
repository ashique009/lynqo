import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User, Camera, Copy, Check, Eye, EyeOff, RefreshCw,
  LogOut, ShieldAlert, KeyRound, Sparkles, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const Settings = () => {
  const { profile, updateProfile, regenerateRecoveryCode, logout, logoutAll } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(profile?.profile_picture || null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Recovery code management
  const [recoveryCode, setRecoveryCode] = useState(null);
  const [showCode, setShowCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);

  const fileInputRef = useRef(null);

  const handleAvatarSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image file too large. Max 5MB allowed.', 'error');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length < 2) {
      showToast('Display name must be at least 2 characters.', 'error');
      return;
    }

    setIsUpdating(true);
    const result = await updateProfile({
      displayName: trimmed,
      profilePictureFile: avatarFile,
    });
    setIsUpdating(false);

    if (result.success) {
      showToast('Profile updated successfully!', 'success');
      setAvatarFile(null);
    } else {
      showToast(result.message || 'Failed to update profile.', 'error');
    }
  };

  const handleRegenerateCode = async () => {
    setIsRegenerating(true);
    const result = await regenerateRecoveryCode();
    setIsRegenerating(false);
    setShowConfirmRegen(false);

    if (result.success) {
      setRecoveryCode(result.recovery_code);
      setShowCode(true);
      showToast('New recovery code generated! Please save it.', 'success');
    } else {
      showToast(result.message || 'Failed to regenerate recovery code.', 'error');
    }
  };

  const copyId = () => {
    if (profile?.profile_id) {
      navigator.clipboard.writeText(profile.profile_id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      showToast('Profile ID copied!', 'success');
    }
  };

  const copyCode = () => {
    if (recoveryCode) {
      navigator.clipboard.writeText(recoveryCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      showToast('Recovery code copied!', 'success');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
    showToast('Logged out of session.', 'info');
  };

  const handleLogoutAll = async () => {
    await logoutAll();
    navigate('/');
    showToast('Logged out from all devices.', 'info');
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-8">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#F1F5F9]">Profile Settings</h1>
        <p className="text-sm text-[#94A3B8]">Manage your profile details and security recovery code</p>
      </div>

      {/* Edit Profile Card */}
      <div className="p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl space-y-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <User className="w-5 h-5 text-pink-400" />
          <span>Profile Details</span>
        </h2>

        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* Avatar Edit */}
          <div className="flex items-center gap-6">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarSelect}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-2xl overflow-hidden bg-slate-800 border-2 border-pink-500/30 hover:border-pink-500 cursor-pointer group shadow-md shrink-0 transition-colors"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="" width="80" height="80" loading="lazy" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-pink-400 bg-pink-500/10">
                  {profile?.display_name?.charAt(0) || 'U'}
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                <Camera className="w-6 h-6" />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                Change Photo
              </button>
              <p className="text-xs text-slate-500 mt-1.5">JPG, PNG, or WebP (max 5MB)</p>
            </div>
          </div>

          {/* Profile ID (Read Only) */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Your Unique Profile ID
            </label>
            <div className="flex items-center gap-2">
              <div className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-sm tracking-wider flex items-center">
                <span className="accent-gradient-text font-bold">{profile?.profile_id || ''}</span>
              </div>
              <button
                type="button"
                onClick={copyId}
                aria-label="Copy Profile ID"
                className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer shrink-0"
                title="Copy Profile ID"
              >
                {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Display Name Input */}
          <div>
            <label htmlFor="display-name" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              required
              maxLength={50}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={isUpdating || !displayName.trim()}
            className="px-6 py-3 rounded-xl font-bold text-white bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-pink-500/20 text-xs cursor-pointer"
          >
            {isUpdating ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Security & Recovery Code Section */}
      <div className="p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-400" />
            <span>Profile Recovery Code</span>
          </h2>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Your recovery code is the <strong>only way</strong> to restore your account if your browser session is lost or cookies are cleared. It is stored securely hashed on the server.
        </p>

        {recoveryCode ? (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
              Active Recovery Code
            </span>
            <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-amber-500/20">
              <span className="font-mono text-sm md:text-base font-bold text-amber-300 tracking-wider">
                {showCode ? recoveryCode : '••••••••••••••••••••'}
              </span>
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  aria-label={showCode ? 'Hide recovery code' : 'Show recovery code'}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                >
                  {showCode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={copyCode}
                  aria-label="Copy recovery code"
                  className="p-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <h4 className="text-xs font-semibold text-slate-200">Generate a fresh recovery code</h4>
                <p className="text-[11px] text-slate-500">Need to view or update your recovery code?</p>
              </div>
            </div>

            <button
              onClick={() => setShowConfirmRegen(true)}
              className="px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              Generate New Code
            </button>
          </div>
        )}

        {recoveryCode && (
          <button
            onClick={() => setShowConfirmRegen(true)}
            className="text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Regenerate a new recovery code</span>
          </button>
        )}
      </div>

      {/* Disconnect Session */}
      <div className="p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-xl backdrop-blur-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white">Log Out / End Session</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Log out of this device, or revoke access on all connected devices.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleLogout}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>This Device</span>
          </button>
          <button
            type="button"
            onClick={handleLogoutAll}
            className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>All Devices</span>
          </button>
        </div>
      </div>

      {/* Confirm Regeneration Modal */}
      {showConfirmRegen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">Regenerate Recovery Code?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                This will immediately invalidate your previous recovery code. Make sure to save the new one!
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowConfirmRegen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRegenerateCode}
                disabled={isRegenerating}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold cursor-pointer transition-colors"
              >
                {isRegenerating ? 'Generating...' : 'Confirm & Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;

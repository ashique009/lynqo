import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, MessageSquare, ShieldCheck, Camera,
  Copy, Check, ArrowRight, KeyRound, UserCheck
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const Landing = () => {
  const { createProfile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdData, setCreatedData] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const fileInputRef = useRef(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      showToast('Image file too large. Max 5MB allowed.', 'error');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Only JPG, PNG, and WebP images are supported.', 'error');
      return;
    }

    setAvatarFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed || trimmed.length < 2) {
      showToast('Please enter a display name (at least 2 characters).', 'error');
      return;
    }

    setIsSubmitting(true);
    const result = await createProfile(trimmed, avatarFile);
    setIsSubmitting(false);

    if (result.success) {
      setCreatedData({
        profile: result.profile,
        recoveryCode: result.recovery_code,
      });
      showToast('Profile created successfully!', 'success');
    } else {
      showToast(result.message || 'Failed to create profile.', 'error');
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'code') {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
      showToast('Recovery code copied to clipboard!', 'success');
    } else {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2500);
      showToast('Profile ID copied!', 'success');
    }
  };

  const proceedToDashboard = () => {
    navigate('/dashboard');
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between overflow-x-hidden selection:bg-pink-500 selection:text-white">
      {/* Background ambient glows */}
      <div className="absolute top-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-pink-600/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-indigo-600/10 blur-[150px] pointer-events-none" />

      {/* Header */}
      <header className="px-6 py-6 md:px-12 flex justify-between items-center relative z-10 border-b border-slate-800/40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-lg shadow-pink-500/25">
            L
          </div>
          <span className="text-2xl font-black font-display tracking-tight bg-gradient-to-r from-pink-400 via-rose-300 to-indigo-300 bg-clip-text text-transparent">
            LYNQO
          </span>
        </div>

        <Link
          to="/recover"
          className="text-sm font-semibold text-slate-300 hover:text-white px-4 py-2 rounded-xl hover:bg-slate-800/50 transition-all duration-200 border border-slate-800 flex items-center gap-2"
        >
          <KeyRound className="w-4 h-4 text-pink-400" />
          <span>Recover Profile</span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex flex-col justify-center items-center px-4 py-12 md:py-16 relative z-10 max-w-5xl mx-auto w-full">
        <div className="grid md:grid-cols-2 gap-12 items-center w-full">
          {/* Left Column: Value Prop */}
          <div className="text-left space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-400 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              Passwordless Real-Time Chat
            </div>

            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight leading-tight">
              Instant Connections.{' '}
              <span className="bg-gradient-to-r from-pink-400 to-indigo-400 bg-clip-text text-transparent">
                Zero Passwords.
              </span>
            </h1>

            <p className="text-slate-400 text-base md:text-lg leading-relaxed">
              Open LYNQO, pick a display name, and start chatting. No phone numbers, no emails, no passwords. Connect privately via unique profile IDs.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm text-slate-200">Private & Secure</h4>
                  <p className="text-xs text-slate-400 mt-1">Single-use recovery codes & HttpOnly sessions.</p>
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-start gap-3">
                <MessageSquare className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-sm text-slate-200">Real-Time Chat</h4>
                  <p className="text-xs text-slate-400 mt-1">Instant delivery receipts, typing indicators & presence.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Profile Creation Card */}
          <div className="w-full max-w-md mx-auto">
            <div className="relative p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl">
              <div className="mb-6 text-center">
                <h3 className="text-2xl font-bold text-white">Create Your Profile</h3>
                <p className="text-sm text-slate-400 mt-1">Get started in 5 seconds</p>
              </div>

              <form onSubmit={handleCreate} className="space-y-6">
                {/* Avatar Picker */}
                <div className="flex flex-col items-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarChange}
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-24 h-24 rounded-full border-2 border-dashed border-pink-500/40 hover:border-pink-500 cursor-pointer flex items-center justify-center overflow-hidden bg-slate-800/60 transition-all duration-200 group shadow-inner"
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center text-slate-400 group-hover:text-pink-400 transition-colors">
                        <Camera className="w-7 h-7 mb-1" />
                        <span className="text-[10px] font-medium uppercase tracking-wider">Add Photo</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Camera className="w-6 h-6 text-white" />
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 mt-2">Optional (JPG, PNG, WebP)</span>
                </div>

                {/* Display Name Input */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    placeholder="e.g. Alex Rivera"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting || !displayName.trim()}
                  className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/25 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Create Profile & Start Chatting</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <div className="text-center pt-2">
                  <Link
                    to="/recover"
                    className="text-xs text-slate-400 hover:text-pink-400 transition-colors"
                  >
                    Lost your browser session? <span className="underline">Recover your profile</span>
                  </Link>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 border-t border-slate-900 text-center text-xs text-slate-500 relative z-10 flex flex-wrap justify-between items-center max-w-6xl mx-auto w-full">
        <span>© {new Date().getFullYear()} LYNQO. Passwordless real-time messaging.</span>
        <div className="flex gap-4 mt-2 sm:mt-0">
          <Link to="/privacy-policy" className="hover:text-slate-300 transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-slate-300 transition-colors">Terms</Link>
          <Link to="/contact-us" className="hover:text-slate-300 transition-colors">Support</Link>
        </div>
      </footer>

      {/* Success Modal: Shows Profile ID and Recovery Code */}
      <AnimatePresence>
        {createdData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl relative space-y-6"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white">Profile Ready!</h3>
                <p className="text-sm text-slate-400">
                  Welcome to LYNQO, <span className="text-white font-semibold">{createdData.profile.display_name}</span>.
                </p>
              </div>

              {/* Profile ID Card */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Your Unique Profile ID</span>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-bold text-pink-400 tracking-wider">
                    {createdData.profile.profile_id}
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdData.profile.profile_id, 'id')}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors flex items-center gap-1 text-xs"
                  >
                    {copiedId ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Recovery Code Card */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <KeyRound className="w-4 h-4" />
                  Save Your Recovery Code
                </div>
                <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-xl border border-amber-500/20">
                  <span className="font-mono text-sm md:text-base font-bold text-amber-300 tracking-wider select-all break-all">
                    {createdData.recoveryCode}
                  </span>
                  <button
                    onClick={() => copyToClipboard(createdData.recoveryCode, 'code')}
                    className="p-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors ml-2 shrink-0"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  ⚠️ Save this code safely. It is single-use and the <strong>only way</strong> to recover your account if you clear your browser.
                </p>
              </div>

              {/* Got It Button */}
              <button
                onClick={proceedToDashboard}
                className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Take Me to Chat</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Landing;

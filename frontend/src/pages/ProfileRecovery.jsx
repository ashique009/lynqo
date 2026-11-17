import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyRound, ArrowRight, ArrowLeft, Check, Copy, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const ProfileRecovery = () => {
  const { recoverProfile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleRecover = async (e) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      showToast('Please enter your recovery code.', 'error');
      return;
    }

    if (!cleanCode.startsWith('REC-')) {
      showToast('Recovery codes start with REC- (e.g. REC-XXXXX-XXXXXXXX)', 'error');
      return;
    }

    setIsSubmitting(true);
    const result = await recoverProfile(cleanCode);
    setIsSubmitting(false);

    if (result.success) {
      setRecoveryResult({
        profile: result.profile,
        newCode: result.new_recovery_code,
      });
      showToast('Profile recovered successfully!', 'success');
    } else {
      showToast(result.message || 'Invalid recovery code. Please check and try again.', 'error');
    }
  };

  const copyCode = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
    showToast('New recovery code copied!', 'success');
  };

  const handleFinish = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 selection:bg-pink-500 selection:text-white">
      {/* Background glow */}
      <div className="fixed top-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-pink-600/10 blur-[150px] pointer-events-none" />

      {/* Header */}
      <header className="max-w-md mx-auto w-full pt-6 flex justify-between items-center">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </Link>
        <span className="text-xl font-black font-display bg-gradient-to-r from-pink-400 to-indigo-400 bg-clip-text text-transparent">
          LYNQO
        </span>
      </header>

      {/* Form Card */}
      <main className="flex-grow flex items-center justify-center py-12">
        <div className="w-full max-w-md p-8 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-white">Recover Your Profile</h2>
            <p className="text-sm text-slate-400">
              Enter the recovery code provided when you created your account.
            </p>
          </div>

          <form onSubmit={handleRecover} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Recovery Code
              </label>
              <input
                type="text"
                required
                placeholder="REC-XXXXX-XXXXXXXX"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all text-center tracking-wider text-base"
              />
              <span className="block text-xs text-slate-500 mt-2 text-center">
                Example: <code className="text-slate-400">REC-8K2A1-9P4W2X8L</code>
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !code.trim()}
              className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Recover Profile</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="text-center pt-2">
            <Link to="/" className="text-xs text-slate-400 hover:text-pink-400 transition-colors">
              Don't have a profile yet? <span className="underline">Create a new profile</span>
            </Link>
          </div>
        </div>
      </main>

      <footer className="max-w-md mx-auto w-full pb-6 text-center text-xs text-slate-600">
        LYNQO • Secure passwordless profile recovery
      </footer>

      {/* Success Modal: Shows rotated new recovery code */}
      <AnimatePresence>
        {recoveryResult && (
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
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-white">Profile Restored!</h3>
                <p className="text-sm text-slate-400">
                  Welcome back, <span className="text-white font-semibold">{recoveryResult.profile.display_name}</span> ({recoveryResult.profile.profile_id}).
                </p>
              </div>

              {/* Rotated Recovery Code Card */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4" />
                  Your New Single-Use Recovery Code
                </div>
                <div className="flex items-center justify-between bg-slate-950 p-3 rounded-xl border border-amber-500/20">
                  <span className="font-mono text-sm md:text-base font-bold text-amber-300 tracking-wider select-all break-all">
                    {recoveryResult.newCode}
                  </span>
                  <button
                    onClick={() => copyCode(recoveryResult.newCode)}
                    className="p-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 transition-colors ml-2 shrink-0"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-amber-300/80 leading-relaxed">
                  ⚠️ Your old recovery code has been invalidated for security. Please save this new code in a safe place.
                </p>
              </div>

              <button
                onClick={handleFinish}
                className="w-full py-4 rounded-xl font-bold text-white bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue to Chat</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ProfileRecovery;

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, ArrowLeft, ArrowRight, Check, Copy, Lock, Eye, EyeOff, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const ProfileRecovery = () => {
  const { recoverProfile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const handleRecover = async (e) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode) {
      showToast('Please enter your recovery code.', 'error');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      showToast('New password must be at least 4 characters long.', 'error');
      return;
    }

    setIsSubmitting(true);
    const result = await recoverProfile(cleanCode, cleanUsername || null, newPassword);
    setIsSubmitting(false);

    if (result.success) {
      setRecoveryResult({
        profile: result.profile,
        newCode: result.new_recovery_code,
      });
      showToast('Account recovered successfully!', 'success');
    } else {
      showToast(result.message || 'Invalid recovery credentials. Please verify your code and username.', 'error');
    }
  };

  const copyCode = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
    showToast('New recovery code copied to clipboard!', 'success');
  };

  const handleFinish = () => {
    navigate('/dashboard');
  };

  return (
    <div className="relative min-h-dvh bg-slate-950 text-slate-100 flex flex-col justify-between overflow-x-hidden selection:bg-pink-500 selection:text-white">
      {/* Background ambient glows */}
      <div className="absolute top-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-pink-600/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-indigo-600/10 blur-[150px] pointer-events-none" />

      {/* Header */}
      <header className="px-6 py-6 md:px-12 flex justify-between items-center relative z-10 border-b border-slate-800/40">
        <Link to="/" className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Login</span>
        </Link>
        <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
          LYNQO
        </span>
      </header>

      {/* Main Container */}
      <main className="flex-grow flex items-center justify-center p-4 relative z-10 py-10">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {recoveryResult ? (
            /* Post-Recovery New Code Confirmation */
            <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-white">Account Recovered!</h2>
                <p className="text-xs text-slate-400">
                  Your password has been reset and all previous device sessions have been safely revoked.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Your New Recovery Code
                </span>
                <p className="text-[10px] text-slate-500">Your previous code is now invalid. Save this new code safely:</p>
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/60 font-mono text-sm sm:text-base font-bold">
                  <span className="truncate accent-gradient-text">{recoveryResult.newCode}</span>
                  <button
                    type="button"
                    onClick={() => copyCode(recoveryResult.newCode)}
                    className="p-1.5 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 transition-colors cursor-pointer shrink-0"
                    title="Copy code"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* Recovery Form */
            <div className="space-y-6">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-2xl bg-pink-500/10 border border-pink-500/20 text-pink-400 flex items-center justify-center mx-auto">
                  <KeyRound className="w-6 h-6" />
                </div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Account Recovery</h1>
                <p className="text-xs text-slate-400">
                  Reset your password securely using your single-use recovery code.
                </p>
              </div>

              <form onSubmit={handleRecover} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Username</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="Username or Profile ID"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Recovery Code</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="REC-XXXXX-XXXXXXXX"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      disabled={isSubmitting}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white font-mono placeholder-slate-600 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all uppercase tracking-wider"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="At least 4 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={isSubmitting}
                      className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-0 top-0 bottom-0 px-3.5 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  ) : (
                    <span>Reset Password &amp; Login</span>
                  )}
                </button>
              </form>

              <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 text-center">
                Lost both password and recovery code? Contact the server owner for owner-controlled terminal recovery.
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-center text-xs text-slate-400 relative z-10">
        LYNQO &copy; {new Date().getFullYear()} &middot; Private, End-to-End Responsive Messaging
      </footer>
    </div>
  );
};

export default ProfileRecovery;

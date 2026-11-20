import React, { useState, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, User, Lock, ArrowRight, Camera, Copy, Check, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export const Login = () => {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sign up fields
  const [displayName, setDisplayName] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [createdData, setCreatedData] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  const fileInputRef = useRef(null);

  const { login, createProfile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/dashboard';

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      showToast('Please enter your username and password.', 'error');
      return;
    }

    setLoading(true);
    const result = await login(cleanUsername, password);
    setLoading(false);

    if (result.success) {
      showToast('Welcome back to LYNQO!', 'success');
      navigate(from, { replace: true });
    } else {
      showToast(result.message || 'Invalid username or password.', 'error');
    }
  };

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

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    const cleanName = displayName.trim();
    if (!cleanName || cleanName.length < 2) {
      showToast('Please enter a display name (at least 2 characters).', 'error');
      return;
    }

    if (signupPassword && signupPassword.length < 4) {
      showToast('Password must be at least 4 characters long.', 'error');
      return;
    }

    setLoading(true);
    const result = await createProfile(cleanName, avatarFile, signupUsername.trim() || null, signupPassword || null);
    setLoading(false);

    if (result.success) {
      setCreatedData({
        profile: result.profile,
        recoveryCode: result.recovery_code,
      });
      showToast('Account created successfully!', 'success');
    } else {
      showToast(result.message || 'Failed to create account.', 'error');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
    showToast('Recovery code copied to clipboard!', 'success');
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
          <span className="font-extrabold text-2xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            LYNQO
          </span>
        </div>
        <Link
          to="/recover"
          className="text-xs sm:text-sm font-semibold text-pink-400 hover:text-pink-300 transition-colors"
        >
          Forgot Password?
        </Link>
      </header>

      {/* Main Container */}
      <main className="flex-grow flex items-center justify-center p-4 relative z-10 py-10">
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          {createdData ? (
            /* Post-Registration Recovery Code Confirmation */
            <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-white">Save Your Recovery Code</h2>
                <p className="text-xs text-slate-400">
                  This single-use code is required to recover your account if you ever forget your password.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Your Recovery Code
                </span>
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/90 border border-slate-700/60 font-mono text-sm sm:text-base font-bold text-pink-400">
                  <span className="truncate">{createdData.recoveryCode}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createdData.recoveryCode)}
                    className="p-1.5 rounded-lg bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 transition-colors cursor-pointer shrink-0"
                    title="Copy code"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={proceedToDashboard}
                className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Continue to Chats</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : mode === 'login' ? (
            /* Minimal Clean Login Interface */
            <div className="space-y-6">
              <div className="text-center space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">LYNQO</h1>
                <p className="text-xs text-slate-400">Private, secure messaging.</p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Username</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      placeholder="Username or Profile ID"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      disabled={loading}
                      className="w-full pl-10 pr-4 py-3 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">Password</label>
                    <Link
                      to="/recover"
                      className="text-xs text-pink-400 hover:text-pink-300 font-medium transition-colors"
                    >
                      Forgot Password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-500" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
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
                  disabled={loading}
                  className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {loading ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  ) : (
                    <span>Login</span>
                  )}
                </button>
              </form>

              <div className="pt-2 text-center border-t border-slate-800/80">
                <p className="text-xs text-slate-400">
                  New to LYNQO?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="text-pink-400 hover:text-pink-300 font-semibold cursor-pointer underline transition-colors"
                  >
                    Create Account
                  </button>
                </p>
              </div>
            </div>
          ) : (
            /* Create Account Form */
            <div className="space-y-6">
              <div className="text-center space-y-1">
                <h1 className="text-2xl font-extrabold text-white">Create Account</h1>
                <p className="text-xs text-slate-400">Join LYNQO private messaging</p>
              </div>

              <form onSubmit={handleSignupSubmit} className="space-y-4">
                {/* Avatar Picker */}
                <div className="flex flex-col items-center">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-18 h-18 rounded-2xl bg-slate-950 border border-dashed border-slate-700 hover:border-pink-500 transition-colors flex items-center justify-center cursor-pointer overflow-hidden group shadow-inner"
                  >
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-6 h-6 text-slate-500 group-hover:text-pink-400 transition-colors" />
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <span className="text-[11px] text-slate-400 mt-1.5">Avatar (optional)</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Display Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Username <span className="text-slate-400 font-normal">(optional, min 3 chars)</span>
                  </label>
                  <input
                    type="text"
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="e.g. alex_lynqo (defaults to ID)"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Password <span className="text-slate-400 font-normal">(min 4 characters)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showSignupPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      disabled={loading}
                      className="w-full px-4 pr-10 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword(!showSignupPassword)}
                      aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-0 top-0 bottom-0 px-3.5 flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-2 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 active:scale-[0.99] text-white font-bold text-sm shadow-lg shadow-pink-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {loading ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                  ) : (
                    <span>Create Account</span>
                  )}
                </button>
              </form>

              <div className="pt-2 text-center border-t border-slate-800/80">
                <p className="text-xs text-slate-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-pink-400 hover:text-pink-300 font-semibold cursor-pointer underline transition-colors"
                  >
                    Log In
                  </button>
                </p>
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

export default Login;

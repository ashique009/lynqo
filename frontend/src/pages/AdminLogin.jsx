import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../services/adminService';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Lock, ShieldAlert, ArrowRight, Loader2, Eye, EyeOff } from 'lucide-react';

export default function AdminLogin() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const res = await adminLogin(identifier, password);

    setLoading(false);

    if (res.success) {
      localStorage.setItem('admin_token', res.data.token);
      navigate('/admin/dashboard');
    } else {
      setError(res.message || 'Login failed');
    }
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-[#050508] px-4 overflow-hidden select-none">
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-brand-purple/10 blur-[150px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-indigo-500/10 blur-[150px] pointer-events-none z-0" />
      
      {/* Grid Pattern overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)] pointer-events-none z-0" />

      {/* Main card */}
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-brand-dark/45 backdrop-blur-xl border border-brand-purple/20 rounded-2xl p-8 md:p-10 shadow-[0_0_50px_rgba(124,58,237,0.15)] z-10"
      >
        <div className="flex flex-col items-center mb-8">
          {/* Glowing Badge */}
          <div className="w-12 h-12 rounded-xl bg-brand-purple/10 border border-brand-purple/35 flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(124,58,237,0.25)]">
            <Lock className="w-5 h-5 text-brand-purple-light animate-pulse" />
          </div>
          
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-purple-400 via-fuchsia-500 to-indigo-400 bg-clip-text text-transparent font-display">
            Lynqo
          </h1>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] tracking-wider uppercase font-bold text-slate-400 bg-brand-purple/10 border border-brand-purple/20 px-2 py-0.5 rounded">
              Admin Console
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 p-3 rounded-xl text-sm"
              >
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <p className="font-semibold">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-4">
            <div className="relative group">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-brand-purple-light transition-colors" />
              <input
                className="w-full pl-11 pr-4 py-3 bg-brand-black/60 border border-brand-purple/15 rounded-xl text-white placeholder-slate-500 focus:border-brand-purple focus:ring-1 focus:ring-brand-purple-light/20 outline-none transition-all duration-300 font-medium"
                placeholder="Username or Email"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-brand-purple-light transition-colors" />
              <input
                className="w-full pl-11 pr-11 py-3 bg-brand-black/60 border border-brand-purple/15 rounded-xl text-white placeholder-slate-500 focus:border-brand-purple focus:ring-1 focus:ring-brand-purple-light/20 outline-none transition-all duration-300 font-medium"
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer transition-colors"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-purple to-brand-purple-light text-white font-bold text-sm tracking-wide shadow-md shadow-brand-purple/20 flex items-center justify-center gap-2 hover:brightness-110 active:brightness-95 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Access Console</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
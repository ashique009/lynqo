import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export const NotFound = () => {
  return (
    <div className="min-h-[calc(100dvh-130px)] flex flex-col items-center justify-center text-center p-4">
      {/* GLOW */}
      <div className="absolute w-60 h-60 rounded-full bg-brand-purple/10 blur-[60px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', duration: 0.5 }}
        className="glass-panel p-8 md:p-12 rounded-3xl border border-brand-purple/15 max-w-md w-full bg-brand-dark/20 relative z-10"
      >
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mx-auto mb-6">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <h2 className="text-4xl font-extrabold font-display text-slate-100 mb-2 tracking-tight">404</h2>
        <h3 className="text-lg font-bold text-slate-300 mb-2">Lost in the Grid</h3>
        <p className="text-xs text-slate-500 max-w-xs mx-auto mb-8 leading-relaxed">
          The page you are looking for does not exist, has been removed, or was never built under the MVP specifications.
        </p>

        <Link
          to="/dashboard"
          className="w-full bg-brand-purple hover:bg-brand-purple-dark text-white text-xs font-bold py-3.5 rounded-xl transition-all duration-300 border border-brand-purple-light/20 flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-brand-purple/10"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Dashboard</span>
        </Link>
      </motion.div>
    </div>
  );
};

export default NotFound;

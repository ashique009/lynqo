import React from 'react';
import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';

export const AuthLayout = () => {
  return (
    <div className="relative min-h-screen bg-[#FCEEF3] dark:bg-brand-black text-[#2C2C2A] dark:text-slate-100 flex flex-col justify-center items-center p-4 overflow-hidden select-none transition-colors duration-200">
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#D4537E]/10 dark:bg-brand-purple/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#F0997B]/10 dark:bg-brand-purple-light/5 blur-[120px] pointer-events-none" />
      
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mb-8 z-10"
      >
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-[#D4537E] via-[#F0997B] to-[#D4537E] dark:from-white dark:via-purple-300 dark:to-brand-purple-light bg-clip-text text-transparent font-display m-0">
          Lynqo
        </h1>
        <p className="text-[#5F5E5A] dark:text-slate-400 text-sm mt-2 tracking-wide font-medium">
          Connect Beyond Chats.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-2xl relative z-10 border border-[#F4C0D1] dark:border-brand-purple/20 bg-white/90 dark:bg-brand-dark/40"
      >
        <Outlet />
      </motion.div>
      
      <div className="mt-8 text-center text-xs text-[#5F5E5A] dark:text-slate-500 font-medium z-10 max-w-xs">
        A trusted social platform to build genuine friendships and meaningful relationships.
      </div>
    </div>
  );
};

export default AuthLayout;

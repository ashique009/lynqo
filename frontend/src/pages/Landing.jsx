import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, MessageSquare, ShieldCheck, Heart } from 'lucide-react';

export const Landing = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } }
  };

  const features = [
    {
      icon: Sparkles,
      title: 'Smart Suggestions',
      desc: 'Connect with people in your city effortlessly.'
    },
    {
      icon: MessageSquare,
      title: 'Direct Chat',
      desc: 'Safe, private messaging to chat with your approved connections instantly.'
    },
    {
      icon: ShieldCheck,
      title: 'Trusted Socials',
      desc: 'Verify handles, exchange requests, and block unwanted spam accounts.'
    },
    {
      icon: Heart,
      title: 'Genuine Connections',
      desc: 'No generic swipe feeds. Only build high-intent friendships and connections.'
    }
  ];

  return (
    <div className="relative min-h-screen bg-brand-black text-slate-100 flex flex-col justify-between overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute top-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-brand-purple/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-25%] right-[-25%] w-[65vw] h-[65vw] rounded-full bg-indigo-600/5 blur-[160px] pointer-events-none" />

      {/* Landing Header */}
      <header className="px-6 py-6 md:px-12 flex justify-between items-center relative z-10">
        <span className="text-2xl font-black font-display bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent select-none">
          Lynqo
        </span>
        <div className="flex gap-4">
          <Link
            to="/login"
            className="text-sm font-semibold text-slate-300 hover:text-white px-4 py-2 rounded-xl hover:bg-slate-800/30 transition-all duration-300"
          >
            Log In
          </Link>
          <Link
            to="/signup"
            className="text-sm font-semibold bg-brand-purple hover:bg-brand-purple-dark text-white px-5 py-2 rounded-xl transition-all duration-300 shadow-lg shadow-brand-purple/20 border border-brand-purple-light/20"
          >
            Sign Up
          </Link>
        </div>
      </header>

      {/* Hero Showcase */}
      <main className="flex-grow flex flex-col justify-center items-center px-4 py-16 md:py-24 text-center relative z-10 max-w-5xl mx-auto">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center gap-6"
        >
          <motion.div
            variants={itemVariants}
            className="px-3.5 py-1.5 rounded-full bg-brand-purple/10 border border-brand-purple/30 text-brand-purple-light text-xs font-bold uppercase tracking-widest"
          >
            Social Platform
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-5xl md:text-7xl font-extrabold tracking-tight font-display bg-gradient-to-b from-white via-slate-100 to-slate-400 bg-clip-text text-transparent leading-none"
          >
            Connect Beyond Chats.
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-slate-400 text-lg md:text-xl max-w-2xl font-medium leading-relaxed"
          >
            A trusted social platform to build genuine friendships and meaningful relationships. Connect authentically with people nearby.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="flex flex-wrap gap-4 justify-center mt-4"
          >
            <Link
              to="/signup"
              className="text-base font-bold bg-brand-purple hover:bg-brand-purple-dark text-white px-8 py-4 rounded-2xl transition-all duration-300 shadow-xl shadow-brand-purple/30 border border-brand-purple-light/20 transform hover:-translate-y-0.5 cursor-pointer"
            >
              Get Started Free
            </Link>
            <Link
              to="/login"
              className="text-base font-bold glass-panel hover:bg-slate-800/40 text-slate-200 px-8 py-4 rounded-2xl transition-all duration-300 border border-slate-700/30 transform hover:-translate-y-0.5 cursor-pointer"
            >
              Explore Features
            </Link>
          </motion.div>

          {/* Grid Features */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-16 md:mt-24 text-left w-full"
          >
            {features.map((feat, index) => {
              const Icon = feat.icon;
              return (
                <div
                  key={index}
                  className="glass-panel p-6 rounded-2xl border border-brand-purple/10 flex flex-col gap-3 bg-brand-dark/20 hover:border-brand-purple/35 transition-all duration-300 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center text-brand-purple-light group-hover:bg-brand-purple/20 transition-all duration-300">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-100 font-display">
                    {feat.title}
                  </h3>
                  <p className="text-slate-400 text-xs font-medium leading-relaxed">
                    {feat.desc}
                  </p>
                </div>
              );
            })}
          </motion.div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-slate-900 text-center text-xs text-slate-500 font-medium z-10 relative">
        <p>© 2026 Lynqo. All rights reserved.</p>
        <p className="mt-1.5 text-slate-600">Built securely for genuine connections.</p>
      </footer>
    </div>
  );
};

export default Landing;

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { authService } from '../services/authService';
import {
  Mail,
  User,
  MessageSquare,
  Send,
  ArrowLeft,
  Sun,
  Moon,
  Headphones,
  CheckCircle2,
} from 'lucide-react';

export const ContactUs = () => {
  const navigate = useNavigate();
  const { userProfile, username } = useAuth();
  const { showToast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (userProfile) {
      if (userProfile.full_name) {
        setName(userProfile.full_name);
      } else if (username) {
        setName(username);
      }
      if (userProfile.user?.email) {
        setEmail(userProfile.user.email);
      } else if (userProfile.email) {
        setEmail(userProfile.email);
      }
    }
  }, [userProfile, username]);

  const handleGoBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) {
      showToast('Please complete all form fields.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await authService.contactUs(
        name.trim(),
        email.trim(),
        message.trim()
      );

      setLoading(false);
      if (res.success) {
        showToast(
          res.message || 'Your message has been sent successfully!',
          'success'
        );
        // Clear message field
        setMessage('');
        // Keep name and email if logged in, otherwise reset
        if (!userProfile) {
          setName('');
          setEmail('');
        }
      } else {
        showToast(res.message || 'Failed to send message.', 'error');
      }
    } catch (err) {
      setLoading(false);
      showToast(err.message || 'Failed to send message.', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#FCEEF3] dark:bg-brand-black text-[#2C2C2A] dark:text-slate-100 flex flex-col justify-between transition-colors duration-200 relative overflow-x-hidden select-none">
      {/* Background ambient glows */}
      <div className="fixed top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#D4537E]/10 dark:bg-brand-purple/10 blur-[120px] pointer-events-none z-0" />
      <div className="fixed bottom-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-[#F0997B]/10 dark:bg-brand-purple-light/5 blur-[120px] pointer-events-none z-0" />

      {/* Header Bar */}
      <header className="sticky top-0 z-30 w-full glass-panel border-b border-[#F4C0D1] dark:border-brand-purple/10 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-xs bg-white/80 dark:bg-brand-black/40 backdrop-blur-md">
        <button
          onClick={handleGoBack}
          className="flex items-center gap-2 text-xs font-bold text-[#5F5E5A] hover:text-[#D4537E] dark:text-slate-400 dark:hover:text-brand-purple-light px-3 py-1.5 rounded-xl hover:bg-[#F4C0D1]/30 dark:hover:bg-brand-purple/15 transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <Link to="/" className="flex items-center gap-2 select-none">
          <span className="text-xl md:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-[#D4537E] via-[#F0997B] to-[#D4537E] dark:from-purple-400 dark:via-indigo-300 dark:to-brand-purple-light bg-clip-text text-transparent font-display">
            Lynqo
          </span>
        </Link>

        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-xl text-[#5F5E5A] dark:text-slate-400 hover:text-[#D4537E] dark:hover:text-brand-purple-light bg-[#FCEEF3] dark:bg-brand-dark/40 hover:bg-[#F4C0D1]/40 dark:hover:bg-brand-purple/20 border border-[#F4C0D1] dark:border-brand-purple/20 transition-all duration-200 cursor-pointer flex items-center justify-center"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-[#D4537E]" />
          )}
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-grow py-8 px-4 md:px-8 max-w-xl mx-auto w-full relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#D4537E]/10 dark:bg-brand-purple/15 border border-[#D4537E]/20 dark:border-brand-purple/30 text-[#D4537E] dark:text-brand-purple-light text-xs font-bold uppercase tracking-wider">
            <Headphones className="w-4 h-4" />
            <span>Support & Inquiries</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-extrabold font-display text-[#2C2C2A] dark:text-slate-100 tracking-tight">
            Contact Us
          </h1>

          <p className="text-xs md:text-sm text-[#5F5E5A] dark:text-slate-400 font-medium max-w-md mx-auto">
            Have questions, feedback, or need help? Drop us a message and our team will get back to you.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glass-panel p-6 md:p-8 rounded-3xl border border-[#F4C0D1] dark:border-brand-purple/15 bg-white dark:bg-brand-dark/20 space-y-5 shadow-xl text-left"
        >
          {/* Name Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#5F5E5A] dark:text-slate-400">
              Your Name
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-3.5 w-4 h-4 text-[#5F5E5A] dark:text-slate-500" />
              <input
                type="text"
                className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Email Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#5F5E5A] dark:text-slate-400">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-3.5 w-4 h-4 text-[#5F5E5A] dark:text-slate-500" />
              <input
                type="email"
                className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Message Field */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-[#5F5E5A] dark:text-slate-400">
              Your Message
            </label>
            <div className="relative">
              <MessageSquare className="absolute left-3.5 top-3.5 w-4 h-4 text-[#5F5E5A] dark:text-slate-500" />
              <textarea
                className="w-full glass-input pl-10 pr-4 py-3 rounded-xl text-sm min-h-32 resize-none"
                placeholder="How can we help you?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Direct Email Note */}
          <div className="p-3 rounded-xl bg-[#FCEEF3]/50 dark:bg-brand-black/30 border border-[#F4C0D1]/60 dark:border-brand-purple/20 text-xs text-[#5F5E5A] dark:text-slate-400 flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#D4537E] dark:text-brand-purple-light flex-shrink-0" />
            <span>
              Or email us directly at{' '}
              <a
                href="mailto:lynqoadmin111@gmail.com"
                className="font-bold text-[#D4537E] dark:text-brand-purple-light hover:underline"
              >
                lynqoadmin111@gmail.com
              </a>
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-[#D4537E] hover:bg-[#c2436d] dark:bg-brand-purple dark:hover:bg-brand-purple-dark text-white font-bold py-3.5 rounded-xl transition-all duration-300 border border-transparent dark:border-brand-purple-light/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-[#D4537E]/10 dark:shadow-brand-purple/10"
            disabled={loading}
          >
            {loading ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send Message</span>
              </>
            )}
          </button>
        </form>
      </main>

      {/* Page Footer */}
      <footer className="py-6 text-center text-xs text-[#5F5E5A] dark:text-slate-500 font-medium relative z-10 border-t border-[#F4C0D1]/50 dark:border-slate-900 mt-6">
        <p>© 2026 Lynqo. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default ContactUs;

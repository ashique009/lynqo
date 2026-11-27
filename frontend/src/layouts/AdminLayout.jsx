import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  Users, 
  LogOut, 
  Menu, 
  X, 
  ShieldCheck, 
  ExternalLink 
} from 'lucide-react';
import { useToast } from '../context/ToastContext';

export const AdminLayout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { showToast } = useToast();

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    showToast('Logged out of system administrator console.', 'info');
    setTimeout(() => {
      window.location.href = '/admin/login';
    }, 500);
  };

  const navItems = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Users', path: '/admin/users', icon: Users },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between">
      <div>
        {/* Admin Header */}
        <div className="flex items-center gap-3 px-3 py-6 border-b border-brand-purple/10 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-purple to-pink-500 flex items-center justify-center text-white shadow-lg shadow-brand-purple/20">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-extrabold text-sm tracking-tight text-white font-display uppercase">Lynqo</h2>
            <p className="text-[10px] text-brand-purple-light font-bold uppercase tracking-wider">Admin Console</p>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-3 px-3">
          Management
        </div>
        <nav className="flex flex-col gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-205 cursor-pointer ${
                    isActive
                      ? 'bg-brand-purple/20 text-brand-purple-light border border-brand-purple/35 shadow-md shadow-brand-purple/5'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20 border border-transparent'
                  }`
                }
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Actions */}
      <div className="space-y-4 pt-6 border-t border-brand-purple/10">
        <NavLink
          to="/dashboard"
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/10 border border-transparent transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          <span>Exit Admin Panel</span>
        </NavLink>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold text-rose-400 hover:text-rose-200 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all cursor-pointer text-left"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-brand-black text-slate-100 flex flex-col md:flex-row">
      {/* Background ambient glows */}
      <div className="fixed top-[-20%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-brand-purple/5 blur-[150px] pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-pink-500/5 blur-[150px] pointer-events-none z-0" />

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-6 py-4 bg-brand-dark/60 backdrop-blur-lg border-b border-brand-purple/10 relative z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-purple to-pink-500 flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="font-extrabold text-sm tracking-tight text-white uppercase font-display">Lynqo Admin</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/40 transition-all cursor-pointer"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Desktop Fixed Sidebar */}
      <aside className="hidden md:flex w-64 fixed top-0 bottom-0 left-0 border-r border-brand-purple/10 p-5 bg-brand-dark/40 backdrop-blur-xl z-20 flex-col">
        {sidebarContent}
      </aside>

      {/* Mobile Slide Drawer Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden fixed inset-0 bg-brand-black/80 backdrop-blur-sm z-40"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="md:hidden fixed top-0 bottom-0 left-0 w-72 p-6 bg-brand-dark border-r border-brand-purple/15 shadow-2xl z-50 overflow-y-auto flex flex-col"
            >
              <div className="flex justify-between items-center mb-6 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-purple to-pink-500 flex items-center justify-center text-white">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <span className="font-extrabold text-sm tracking-tight text-white uppercase font-display">Lynqo Admin</span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/50 transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-grow">
                {sidebarContent}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Dynamic View Content */}
      <main className="flex-grow p-6 md:p-10 overflow-y-auto relative z-10 md:pl-64">
        <div className="max-w-6xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;

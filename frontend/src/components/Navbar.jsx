import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, User as UserIcon, MessageSquare, Bell, Sun, Moon } from 'lucide-react';
import client, { API_BASE_URL } from '../api/client';

export const Navbar = () => {
  const { userProfile, logout, username } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  const [notifications, setNotifications] = useState({ unread_messages: 0, pending_requests: 0, total: 0 });
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!userProfile) {
      setNotifications({ unread_messages: 0, pending_requests: 0, total: 0 });
      return;
    }

    const fetchNotifications = async () => {
      try {
        const response = await client.get('/api/auth/notifications/count/');
        if (response.success && response.data) {
          setNotifications(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
      }
    };

    // Initial fetch
    fetchNotifications();

    // Poll every 15 seconds
    const interval = setInterval(fetchNotifications, 15000);

    return () => clearInterval(interval);
  }, [userProfile]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleLogout = async () => {
    if (isAdminPath) {
      localStorage.removeItem('admin_token');
    }
    await logout();
    navigate('/');
  };

  const getProfilePictureUrl = () => {
    if (userProfile && userProfile.profile_picture) {
      if (userProfile.profile_picture.startsWith('http')) {
        return userProfile.profile_picture;
      }
      return `${API_BASE_URL}${userProfile.profile_picture}`;
    }
    return null;
  };

  const avatarUrl = getProfilePictureUrl();

  return (
    <nav className="sticky top-0 z-40 w-full glass-panel border-b border-[#F4C0D1] dark:border-brand-purple/10 px-4 md:px-8 py-3 flex items-center justify-between shadow-lg bg-white/80 dark:bg-brand-black/40 backdrop-blur-md transition-colors duration-200">
      <div className="flex items-center gap-2">
        <Link to={isAdminPath ? "/admin/dashboard" : "/dashboard"} className="flex items-center gap-2 select-none">
          <span className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-[#D4537E] to-[#F0997B] dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent font-display">
            Lynqo
          </span>
          {isAdminPath && (
            <span className="text-[10px] uppercase font-extrabold tracking-widest bg-[#D4537E]/15 dark:bg-brand-purple/20 text-[#D4537E] dark:text-brand-purple-light border border-[#D4537E]/30 dark:border-brand-purple/35 px-2 py-0.5 rounded shadow-sm">
              Admin
            </span>
          )}
        </Link>
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-xl text-[#5F5E5A] dark:text-slate-400 hover:text-[#D4537E] dark:hover:text-brand-purple-light bg-[#FCEEF3] dark:bg-brand-dark/40 hover:bg-[#F4C0D1]/40 dark:hover:bg-brand-purple/20 border border-[#F4C0D1] dark:border-brand-purple/20 transition-all duration-200 cursor-pointer flex items-center justify-center shadow-xs"
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-[#D4537E]" />
          )}
        </button>

        {userProfile ? (
          <div className="flex items-center gap-3">
            {/* Notification Bell & Dropdown */}
            <div className="relative flex items-center" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="p-1.5 rounded-lg text-[#5F5E5A] dark:text-slate-400 hover:text-[#D4537E] dark:hover:text-brand-purple-light hover:bg-[#D4537E]/10 dark:hover:bg-brand-purple/10 transition-all duration-200 cursor-pointer relative flex items-center justify-center"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 transition-transform duration-200 hover:scale-105 active:scale-95" />
                {notifications.total > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-brand-black/90 shadow-md animate-pulse">
                    {notifications.total}
                  </span>
                )}
              </button>

              {isDropdownOpen && (
                <div className="absolute right-0 mt-2 top-full w-64 glass-panel rounded-xl shadow-xl z-50 py-2 border border-[#F4C0D1] dark:border-brand-purple/20 bg-white dark:bg-brand-dark/95 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="px-4 py-2 border-b border-[#F4C0D1] dark:border-brand-purple/10 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#5F5E5A] dark:text-slate-400">Notifications</span>
                    {notifications.total > 0 && (
                      <span className="text-[10px] bg-[#D4537E]/15 dark:bg-brand-purple/20 text-[#D4537E] dark:text-brand-purple-light px-2 py-0.5 rounded-full font-bold">
                        {notifications.total} new
                      </span>
                    )}
                  </div>
                  <div className="py-1">
                    <Link
                      to="/conversations"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[#D4537E]/10 dark:hover:bg-brand-purple/10 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-[#D4537E] dark:text-brand-purple-light group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-[#2C2C2A] dark:text-slate-200 group-hover:text-[#D4537E] dark:group-hover:text-white transition-colors">
                          Messages
                        </span>
                      </div>
                      {notifications.unread_messages > 0 ? (
                        <span className="text-xs bg-rose-500 text-white px-2 py-0.5 rounded-full font-semibold">
                          {notifications.unread_messages}
                        </span>
                      ) : (
                        <span className="text-xs text-[#5F5E5A] dark:text-slate-500">0</span>
                      )}
                    </Link>

                    <Link
                      to="/requests"
                      onClick={() => setIsDropdownOpen(false)}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[#D4537E]/10 dark:hover:bg-brand-purple/10 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-[#D4537E] dark:text-brand-purple-light group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium text-[#2C2C2A] dark:text-slate-200 group-hover:text-[#D4537E] dark:group-hover:text-white transition-colors">
                          Pending Requests
                        </span>
                      </div>
                      {notifications.pending_requests > 0 ? (
                        <span className="text-xs bg-rose-500 text-white px-2 py-0.5 rounded-full font-semibold">
                          {notifications.pending_requests}
                        </span>
                      ) : (
                        <span className="text-xs text-[#5F5E5A] dark:text-slate-500">0</span>
                      )}
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Link
              to={`/profile`}
              className="flex items-center gap-2 group cursor-pointer"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={userProfile.full_name || username}
                  className="w-8 h-8 rounded-full object-cover border border-brand-purple/30 group-hover:border-brand-purple transition-all duration-300"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-brand-purple/20 flex items-center justify-center border border-brand-purple/30 text-brand-purple-light text-xs font-bold uppercase group-hover:border-brand-purple transition-all duration-300">
                  {username ? username.substring(0, 2) : 'CK'}
                </div>
              )}
              <span className="hidden md:inline text-sm font-semibold text-slate-200 group-hover:text-slate-100 transition-colors">
                {userProfile.full_name || username}
              </span>
            </Link>
            
            <div className="h-4 w-px bg-slate-800 hidden md:block"></div>
            
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-all duration-200 cursor-pointer"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Link
              to="/login"
              className="text-xs font-semibold text-slate-300 hover:text-white px-3 py-1.5 rounded-lg transition-all"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              className="text-xs font-semibold bg-brand-purple hover:bg-brand-purple-dark text-white px-3 py-1.5 rounded-lg transition-all shadow-md shadow-brand-purple/25"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;

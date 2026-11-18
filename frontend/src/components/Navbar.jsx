import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LogOut, Settings, Bell, Sun, Moon, UserPlus, Users } from 'lucide-react';
import { connectService } from '../services/connectService';
import { wsService } from '../services/websocketService';

export const Navbar = () => {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

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
    await logout();
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-40 w-full glass-panel border-b border-pink-500/10 px-4 md:px-8 py-3 flex items-center justify-between shadow-lg bg-slate-950/80 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <Link to="/dashboard" className="flex items-center gap-2.5 select-none">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-pink-500 to-indigo-600 flex items-center justify-center text-white font-black text-base shadow-md shadow-pink-500/20">
            L
          </div>
          <span className="text-xl font-black tracking-tight bg-gradient-to-r from-pink-400 via-rose-300 to-indigo-300 bg-clip-text text-transparent font-display">
            LYNQO
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick Find Link */}
        <Link
          to="/find"
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          title="Find Profile"
        >
          <UserPlus className="w-5 h-5" />
        </Link>

        {/* User Avatar & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2.5 p-1 rounded-2xl hover:bg-slate-800/60 transition-all cursor-pointer border border-transparent hover:border-slate-800"
          >
            <div className="w-8 h-8 rounded-xl overflow-hidden bg-slate-800 border border-pink-500/30 shrink-0">
              {profile?.profile_picture ? (
                <img src={profile.profile_picture} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-xs text-pink-400 bg-pink-500/10">
                  {profile?.display_name?.charAt(0) || 'U'}
                </div>
              )}
            </div>
            <span className="hidden md:block text-xs font-bold text-white max-w-[120px] truncate">
              {profile?.display_name}
            </span>
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 text-xs">
              <div className="p-3 border-b border-slate-800 mb-1">
                <p className="font-bold text-white truncate">{profile?.display_name}</p>
                <p className="font-mono text-pink-400 text-[11px] font-semibold">{profile?.profile_id}</p>
              </div>

              <Link
                to="/settings"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Settings & Recovery</span>
              </Link>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors text-left cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

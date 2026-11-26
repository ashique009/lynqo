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
    <nav className="sticky top-0 z-40 w-full border-b border-white/[0.08] px-4 md:px-8 py-2.5 flex items-center justify-between bg-[#080C14]/90 backdrop-blur-md pt-safe">
      <div className="flex items-center gap-2">
        <Link to="/dashboard" className="flex items-center gap-2.5 select-none min-h-[44px]">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#7957F5] to-[#F472B6] flex items-center justify-center text-white font-black text-base shadow-sm">
            L
          </div>
          <span className="text-lg font-bold tracking-tight text-[#F1F5F9] font-display">
            LYNQO
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2">
        {/* Quick Find Link */}
        <Link
          to="/find"
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#111827] transition-colors active:scale-95"
          title="Find Profile"
          aria-label="Find Profile"
        >
          <UserPlus className="w-5 h-5" />
        </Link>

        {/* User Avatar & Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-label="Account menu"
            className="flex items-center gap-2.5 p-1.5 min-h-[44px] rounded-2xl hover:bg-[#111827] transition-all cursor-pointer border border-transparent hover:border-white/[0.08] active:scale-95"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#1E293B] border border-white/[0.12] shrink-0">
              {profile?.profile_picture ? (
                <img src={profile.profile_picture} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-xs text-[#F472B6] bg-[#7957F5]/15">
                  {profile?.display_name?.charAt(0) || 'U'}
                </div>
              )}
            </div>
            <span className="hidden md:block text-xs font-semibold text-[#F1F5F9] max-w-[120px] truncate">
              {profile?.display_name}
            </span>
          </button>

          {isDropdownOpen && (
            <div className="lynqo-modal-enter absolute right-0 mt-2 w-56 rounded-2xl bg-[#111827] border border-white/[0.08] shadow-2xl p-2 z-50 text-xs">
              <div className="p-3 border-b border-white/[0.08] mb-1">
                <p className="font-semibold text-[#F1F5F9] truncate">{profile?.display_name}</p>
                <p className="font-mono text-[#94A3B8] text-[11px]">{profile?.profile_id}</p>
              </div>

              <Link
                to="/settings"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-[#F1F5F9] hover:bg-[#1E293B] transition-colors"
              >
                <Settings className="w-4 h-4 text-[#94A3B8]" />
                <span>Settings & Recovery</span>
              </Link>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-rose-400 hover:bg-rose-500/10 transition-colors text-left cursor-pointer"
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

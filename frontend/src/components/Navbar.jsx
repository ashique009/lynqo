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
    <nav className="sticky top-0 z-40 w-full px-4 md:px-8 py-3 flex items-center justify-between bg-transparent pt-safe">
      <div className="flex items-center gap-2">
        <Link to="/dashboard" className="flex items-center gap-3 select-none min-h-[44px]">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#8B68F6] to-[#EC6EB8] flex items-center justify-center text-white font-black text-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_4px_14px_rgba(139,104,246,0.35)]">
            L
          </div>
          <span className="text-[22px] font-bold tracking-[0.16em] text-white font-display">
            LYNQO
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Circular Liquid Glass Add-Person Button */}
        <Link
          to="/find"
          className="liquid-glass-circle w-11 h-11 rounded-full flex items-center justify-center text-white/90 hover:text-white transition-transform active:scale-95"
          title="Find Profile"
          aria-label="Find Profile"
        >
          <UserPlus className="w-5 h-5" />
        </Link>

        {/* Circular Profile Avatar Button */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            aria-label="Account menu"
            className="liquid-glass-circle w-11 h-11 rounded-full p-0.5 flex items-center justify-center transition-transform cursor-pointer active:scale-95 overflow-hidden"
          >
            {profile?.profile_picture ? (
              <img src={profile.profile_picture} alt="" width="44" height="44" loading="lazy" className="w-full h-full rounded-full object-cover" />
            ) : (
              <div className="w-full h-full rounded-full flex items-center justify-center font-bold text-sm text-white bg-gradient-to-br from-[#8B68F6]/40 to-[#EC6EB8]/30">
                {profile?.display_name?.charAt(0) || 'U'}
              </div>
            )}
          </button>

          {isDropdownOpen && (
            <div className="lynqo-modal-enter liquid-glass-sheet absolute right-0 mt-2 w-56 rounded-2xl p-2 z-50 text-xs">
              <div className="p-3 border-b border-white/[0.1] mb-1">
                <p className="font-semibold text-white truncate">{profile?.display_name}</p>
                <p className="font-mono text-[#B8ABC7] text-[11px]">{profile?.profile_id}</p>
              </div>

              <Link
                to="/settings"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-white hover:bg-white/10 transition-colors"
              >
                <Settings className="w-4 h-4 text-[#C4B5FD]" />
                <span>Settings & Recovery</span>
              </Link>

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-xl text-rose-300 hover:bg-rose-500/15 transition-colors text-left cursor-pointer"
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

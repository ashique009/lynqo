import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  MessageSquare, UserPlus, Users, UserCheck,
  Settings, LogOut, KeyRound
} from 'lucide-react';

export const Sidebar = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const menuItems = [
    { name: 'Chats', path: '/dashboard', icon: MessageSquare },
    { name: 'Find People', path: '/find', icon: UserPlus },
    { name: 'Connections', path: '/connections', icon: Users },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-slate-800/80 bg-slate-950/60 backdrop-blur-md hidden md:flex flex-col justify-between p-4 shrink-0 h-[calc(100vh-4.5rem)] sticky top-[4.5rem]">
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2 block">
          Menu
        </span>
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-3 rounded-2xl font-semibold text-xs transition-all ${
                  isActive
                    ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-900'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </div>

      <div className="pt-4 border-t border-slate-800/80 space-y-2">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-semibold text-xs text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;

import React from 'react';
import { NavLink } from 'react-router-dom';
import { MessageSquare, UserPlus, Users, Settings } from 'lucide-react';

export const BottomNavigation = () => {
  const navItems = [
    { name: 'Chats', path: '/dashboard', icon: MessageSquare },
    { name: 'Find', path: '/find', icon: UserPlus },
    { name: 'Friends', path: '/connections', icon: Users },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-slate-800 px-2 py-2 flex items-center justify-around shadow-2xl bg-slate-950/90 backdrop-blur-lg pb-safe">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center flex-1 py-1 rounded-xl gap-1 text-[11px] font-semibold transition-all ${
                isActive ? 'text-pink-400 font-bold' : 'text-slate-500 hover:text-slate-300'
              }`
            }
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
            </div>
            <span>{item.name}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};

export default BottomNavigation;

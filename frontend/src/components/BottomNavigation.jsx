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
    <nav
      aria-label="Primary mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-white/[0.08] px-2 pt-1.5 pb-safe flex items-center justify-around bg-[#080C14]/92 backdrop-blur-md"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl gap-0.5 text-[11px] font-medium transition-transform duration-150 active:scale-95 ${
                isActive ? 'text-[#7957F5] font-semibold' : 'text-[#94A3B8] hover:text-[#F1F5F9]'
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

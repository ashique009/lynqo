import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Sparkles, 
  UserCheck, 
  MessageSquare, 
  Settings,
  Users,
  ExternalLink
} from 'lucide-react';

export const BottomNavigation = () => {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith('/admin');

  const navItems = isAdminPath
    ? [
        { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
        { name: 'Users', path: '/admin/users', icon: Users },
        { name: 'Settings', path: '/settings', icon: Settings },
      ]
    : [
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Suggestions', path: '/suggestions', icon: Sparkles },
        { name: 'Requests', path: '/requests', icon: UserCheck },
        { name: 'Chats', path: '/conversations', icon: MessageSquare },
        { name: 'Settings', path: '/settings', icon: Settings },
      ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden glass-panel border-t border-brand-purple/10 px-2 py-2 flex items-center justify-around shadow-2xl bg-brand-black/75 backdrop-blur-lg pb-safe-bottom">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-1 rounded-lg gap-1 transition-all duration-200 ${
                isActive
                  ? 'text-brand-purple-light'
                  : 'text-slate-500 hover:text-slate-300'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-bold tracking-wide">
              {item.name}
            </span>
          </NavLink>
        );
      })}
    </nav>
  );
};

export default BottomNavigation;

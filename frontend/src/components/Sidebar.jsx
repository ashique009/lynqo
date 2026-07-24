import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  LayoutDashboard, 
  Sparkles, 
  UserCheck, 
  MessageSquare, 
  Settings, 
  HeartHandshake,
  Users,
  ShieldCheck,
  LogOut
} from 'lucide-react';

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const isAdminPath = location.pathname.startsWith('/admin');

  const handleLogout = async () => {
    if (isAdminPath) {
      localStorage.removeItem('admin_token');
    }
    await logout();
    navigate('/');
  };

  const menuItems = isAdminPath 
    ? [
        { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
        { name: 'Users', path: '/admin/users', icon: Users },
        { name: 'Settings', path: '/settings', icon: Settings },
      ]
    : [
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Suggestions', path: '/suggestions', icon: Sparkles },
        { name: 'Connect Requests', path: '/requests', icon: UserCheck },
        { name: 'Conversations', path: '/conversations', icon: MessageSquare },
        { name: 'Settings', path: '/settings', icon: Settings },
        { name: 'Feedback', path: '/feedback', icon: HeartHandshake },
      ];

  return (
    <aside className="w-64 glass-panel border-r border-[#F4C0D1] dark:border-brand-purple/10 min-h-[calc(100vh-65px)] p-4 flex-shrink-0 flex-col gap-1 hidden md:flex bg-white/70 dark:bg-brand-dark/20 z-10 transition-colors duration-200">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-[#5F5E5A] dark:text-slate-500 mb-3 px-3">
        {isAdminPath ? 'Admin Console' : 'Navigation'}
      </div>
      <div className="flex flex-col gap-1.5 flex-grow">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.name}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-[#D4537E]/15 text-[#D4537E] border border-[#D4537E]/30 shadow-xs dark:bg-brand-purple/20 dark:text-brand-purple-light dark:border-brand-purple/30 shadow-brand-purple/5'
                    : 'text-[#5F5E5A] dark:text-slate-400 hover:text-[#2C2C2A] dark:hover:text-slate-200 hover:bg-[#D4537E]/10 dark:hover:bg-slate-800/20 border border-transparent'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
        {isAdminPath && (
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 border border-transparent transition-all duration-200 cursor-pointer w-full text-left"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        )}
      </div>
      
      <div className="p-3 bg-[#D4537E]/5 dark:bg-brand-purple/5 border border-[#F4C0D1] dark:border-brand-purple/10 rounded-xl mt-auto">
        <div className="text-xs font-bold text-[#2C2C2A] dark:text-slate-300 font-display flex items-center gap-1.5">
          {isAdminPath ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-[#D4537E] dark:text-brand-purple-light" />
              <span className="text-[#D4537E] dark:text-brand-purple-light">Lynqo Admin</span>
            </>
          ) : (
            <span>Lynqo MVP</span>
          )}
        </div>
        <div className="text-[10px] text-[#5F5E5A] dark:text-slate-500 mt-1">
          {isAdminPath ? 'System Administration' : 'Connect Beyond Chats.'}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

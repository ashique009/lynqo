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
    <aside className="w-64 glass-panel border-r border-brand-purple/10 min-h-[calc(100vh-65px)] p-4 flex-shrink-0 flex-col gap-1 hidden md:flex bg-brand-dark/20 z-10">
      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-3 px-3">
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
                    ? 'bg-brand-purple/20 text-brand-purple-light border border-brand-purple/30 shadow-md shadow-brand-purple/5'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/20 border border-transparent'
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
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-rose-400 hover:text-rose-350 hover:bg-rose-500/10 border border-transparent transition-all duration-200 cursor-pointer w-full text-left"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        )}
      </div>
      
      <div className="p-3 bg-brand-purple/5 border border-brand-purple/10 rounded-xl mt-auto">
        <div className="text-xs font-bold text-slate-300 font-display flex items-center gap-1.5">
          {isAdminPath ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-brand-purple-light" />
              <span className="text-brand-purple-light">Chikkundo Admin</span>
            </>
          ) : (
            <span>Chikkundo MVP</span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 mt-1">
          {isAdminPath ? 'System Administration' : 'Find Your Perfect Mid.'}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

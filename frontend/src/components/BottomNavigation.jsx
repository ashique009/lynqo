import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { MessageSquare, UserPlus, UserCheck, Users, Settings } from 'lucide-react';
import { connectService } from '../services/connectService';
import { wsService } from '../services/websocketService';
import { useAuth } from '../context/AuthContext';

export const BottomNavigation = () => {
  const { profile } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPending = async () => {
    try {
      const res = await connectService.getIncomingRequests();
      if (res.success) {
        setPendingCount(res.requests?.length || 0);
      }
    } catch {
      // Ignore background errors
    }
  };

  useEffect(() => {
    if (profile) {
      fetchPending();
      const unsub = wsService.on('connection_event', () => fetchPending());
      return () => unsub();
    }
  }, [profile]);

  const navItems = [
    { name: 'Chats', path: '/dashboard', icon: MessageSquare },
    { name: 'Find', path: '/find', icon: UserPlus },
    { name: 'Requests', path: '/requests', icon: UserCheck, badge: pendingCount },
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
              {item.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-pink-500 rounded-full" />
              )}
            </div>
            <span>{item.name}</span>
          </NavLink>
        );
      })}
    </nav>
  );
};

export default BottomNavigation;

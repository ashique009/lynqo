import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import BottomNavigation from '../components/BottomNavigation';
import { useVisualViewport } from '../hooks/useVisualViewport';

export const MainLayout = () => {
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith('/chat/');
  const { viewportHeight } = useVisualViewport(isChatRoute);

  return (
    <div
      style={
        isChatRoute && viewportHeight
          ? { height: `${viewportHeight}px` }
          : undefined
      }
      className={`min-h-dvh text-[#F1F5F9] flex flex-col selection:bg-[#9880D9] selection:text-white overflow-x-clip transition-colors duration-200 ${
        isChatRoute ? 'h-[100dvh] overflow-hidden bg-[var(--lynqo-bg)]' : 'dashboard-liquid-bg'
      }`}
    >

      {/* Top Navbar: hidden on mobile in active chat to maximize screen space */}
      <div className={isChatRoute ? 'hidden md:block' : ''}>
        <Navbar />
      </div>

      {/* Main Container */}
      <div className="flex flex-grow relative z-10 min-h-0">
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Dynamic Page Content */}
        <main className={`flex-grow ${
          isChatRoute
            ? 'p-0 md:p-8 overflow-hidden h-full flex flex-col'
            : 'px-4 pt-2 pb-32 md:p-8 overflow-y-auto'
        }`}>
          <div className={isChatRoute ? 'w-full h-full' : 'max-w-6xl mx-auto w-full'}>
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation: hidden in active chat */}
      {!isChatRoute && <BottomNavigation />}
    </div>
  );
};

export default MainLayout;

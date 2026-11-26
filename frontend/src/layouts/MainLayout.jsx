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
      className={`min-h-dvh bg-[#080C14] text-[#F1F5F9] flex flex-col selection:bg-[#7957F5] selection:text-white overflow-x-clip ${
        isChatRoute ? 'h-[100dvh] overflow-hidden' : ''
      }`}
    >
      {/* Subtle ambient radial accent (zero GPU blur filter) */}
      <div className="fixed top-[-25%] right-[-20%] w-[55vw] h-[55vw] rounded-full bg-[radial-gradient(circle,rgba(121,87,245,0.06)_0%,transparent_70%)] pointer-events-none z-0" />

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
            : 'p-4 md:p-8 overflow-y-auto pb-24 md:pb-8'
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

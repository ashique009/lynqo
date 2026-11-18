import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import BottomNavigation from '../components/BottomNavigation';

export const MainLayout = () => {
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith('/chat/');

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-pink-500 selection:text-white ${
      isChatRoute ? 'h-[100dvh] overflow-hidden' : ''
    }`}>
      {/* Background ambient glows */}
      <div className="fixed top-[-20%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-pink-600/5 blur-[150px] pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-indigo-600/5 blur-[150px] pointer-events-none z-0" />

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

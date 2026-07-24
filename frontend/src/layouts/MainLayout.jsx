import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import BottomNavigation from '../components/BottomNavigation';

export const MainLayout = () => {
  return (
    <div className="min-h-screen bg-[#FCEEF3] dark:bg-brand-black text-[#2C2C2A] dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Background ambient glows */}
      <div className="fixed top-[-20%] right-[-20%] w-[60vw] h-[60vw] rounded-full bg-[#D4537E]/5 dark:bg-brand-purple/5 blur-[150px] pointer-events-none z-0" />
      <div className="fixed bottom-[-20%] left-[-20%] w-[60vw] h-[60vw] rounded-full bg-[#F0997B]/5 dark:bg-indigo-500/5 blur-[150px] pointer-events-none z-0" />

      {/* Top Navbar */}
      <Navbar />

      {/* Main Container */}
      <div className="flex flex-grow relative z-10">
        {/* Desktop Sidebar */}
        <Sidebar />

        {/* Dynamic Page Content */}
        <main className="flex-grow p-4 md:p-8 overflow-y-auto pb-24 md:pb-8">
          <div className="max-w-6xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};

export default MainLayout;

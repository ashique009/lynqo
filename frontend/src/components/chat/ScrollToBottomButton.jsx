import React from 'react';
import { ChevronDown } from 'lucide-react';

export const ScrollToBottomButton = React.memo(({ visible, onClick }) => {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="absolute bottom-20 right-6 sm:right-8 p-2.5 rounded-full bg-pink-500 hover:bg-pink-600 text-white shadow-xl transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer z-10"
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="w-4 h-4" />
      <span className="hidden sm:inline">New messages</span>
    </button>
  );
});

export default ScrollToBottomButton;

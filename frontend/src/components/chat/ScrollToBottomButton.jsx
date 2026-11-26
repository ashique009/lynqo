import React from 'react';
import { ChevronDown } from 'lucide-react';

export const ScrollToBottomButton = React.memo(({ visible, onClick }) => {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="lynqo-toast-enter absolute bottom-20 right-4 sm:right-6 min-w-[44px] min-h-[44px] px-3 rounded-full bg-[#111827]/95 border border-white/[0.12] hover:bg-[#1E293B] active:scale-95 text-[#F1F5F9] shadow-lg transition-transform flex items-center justify-center gap-1.5 text-xs font-medium cursor-pointer z-20"
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="w-4 h-4 text-[#7957F5]" />
      <span className="hidden sm:inline">Latest</span>
    </button>
  );
});

export default ScrollToBottomButton;

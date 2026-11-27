import React from 'react';
import { ChevronDown } from 'lucide-react';

export const ScrollToBottomButton = React.memo(({ visible, unreadCount = 0, onClick, bottomOffset }) => {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      style={bottomOffset ? { bottom: `${bottomOffset}px` } : undefined}
      className={`lynqo-toast-enter liquid-glass-circle absolute ${bottomOffset ? '' : 'bottom-24'} right-4 sm:right-6 w-11 h-11 rounded-full active:scale-95 text-white transition-all duration-200 flex items-center justify-center cursor-pointer z-20`}
      aria-label={unreadCount > 0 ? `Scroll to bottom (${unreadCount} new messages)` : 'Scroll to bottom'}
    >
      <ChevronDown className="w-5 h-5 text-white/90" />
      {unreadCount > 0 && (
        <span className="absolute -top-2 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-gradient-to-r from-[#8B68F6] to-[#EC6EB8] border border-white/30 text-white text-[11px] font-bold flex items-center justify-center shadow-md tabular-nums">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
});

export default ScrollToBottomButton;

import React from 'react';
import { ChevronDown } from 'lucide-react';

export const ScrollToBottomButton = React.memo(({ visible, onClick }) => {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="lynqo-toast-enter liquid-glass-circle absolute bottom-24 right-4 sm:right-6 w-11 h-11 rounded-full active:scale-95 text-white transition-transform flex items-center justify-center cursor-pointer z-20"
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="w-5 h-5 text-white/90" />
    </button>
  );
});

export default ScrollToBottomButton;

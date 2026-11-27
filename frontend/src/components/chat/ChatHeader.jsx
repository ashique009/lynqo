import React from 'react';
import { ChevronLeft, WifiOff } from 'lucide-react';
import { getOptimizedImageUrl } from '../../utils/imageUtils';

export const ChatHeader = React.memo(({ otherUser, otherUserTyping, isWsConnected, onBack }) => {
  return (
    <header className="bg-[#110B1E]/75 backdrop-blur-md px-3 sm:px-4 pt-safe pb-3 shrink-0 z-20 transition-colors border-b border-white/[0.08]">
      <div className="h-12 flex items-center justify-between gap-2 relative">
        {/* Left: Circular Liquid Glass Back Button */}
        <button
          type="button"
          onClick={onBack}
          className="liquid-glass-circle w-11 h-11 rounded-full text-white active:scale-95 transition-transform flex items-center justify-center shrink-0 cursor-pointer z-10"
          aria-label="Back to dashboard"
        >
          <ChevronLeft className="w-5 h-5 -ml-0.5" />
        </button>

        {/* Center: Centered Username & Online Status */}
        <div className="absolute inset-x-14 flex flex-col items-center justify-center text-center pointer-events-none">
          <h3 className="font-semibold text-[17px] leading-tight text-white truncate max-w-[200px] sm:max-w-[280px]">
            {otherUser?.display_name || 'Chat'}
          </h3>
          <div className="text-[12px] leading-tight text-[#A99BB8] flex items-center gap-1.5 mt-0.5">
            {otherUserTyping ? (
              <span className="text-[#F472B6] font-medium">Typing...</span>
            ) : otherUser?.is_online ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                Online
              </span>
            ) : (
              <span>Offline</span>
            )}
          </div>
        </div>

        {/* Right: Reconnect Indicator & Gradient Profile Avatar */}
        <div className="flex items-center gap-1.5 z-10">
          {!isWsConnected && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-300 text-[11px] font-medium shrink-0"
              title="Reconnecting"
            >
              <WifiOff className="w-3.5 h-3.5 animate-pulse motion-reduce:animate-none" />
              <span className="hidden sm:inline">Reconnecting</span>
            </div>
          )}

          <div className="relative w-11 h-11 rounded-full overflow-hidden bg-gradient-to-br from-[#8B68F6] to-[#EC6EB8] border border-white/25 shadow-[0_4px_14px_rgba(139,104,246,0.3)] shrink-0">
            {otherUser?.profile_picture ? (
              <img
                src={getOptimizedImageUrl(otherUser.profile_picture, { width: 88, height: 88 })}
                alt=""
                width="44"
                height="44"
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-base text-white">
                {otherUser?.display_name?.charAt(0) || 'U'}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
});

export default ChatHeader;

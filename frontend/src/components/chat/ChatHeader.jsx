import React from 'react';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { getOptimizedImageUrl } from '../../utils/imageUtils';

export const ChatHeader = React.memo(({ otherUser, otherUserTyping, isWsConnected, onBack }) => {
  return (
    <header className="px-2 sm:px-4 py-1.5 bg-[#080C14]/95 backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between gap-2 shrink-0 pt-safe z-20">
      <div className="flex items-center gap-1 sm:gap-2 min-w-0">
        <button
          type="button"
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] rounded-full text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-[#111827] active:scale-95 transition-transform flex items-center justify-center shrink-0 cursor-pointer"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="relative w-9 h-9 rounded-full overflow-hidden bg-[#1E293B] border border-white/[0.08] shrink-0">
          {otherUser?.profile_picture ? (
            <img
              src={getOptimizedImageUrl(otherUser.profile_picture, { width: 88, height: 88 })}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-semibold text-sm text-[#F472B6] bg-[#6848D8]/20">
              {otherUser?.display_name?.charAt(0) || 'U'}
            </div>
          )}
          {otherUser?.is_online && (
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-[#080C14] rounded-full" />
          )}
        </div>

        <div className="min-w-0 pl-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-[15px] leading-tight text-[#F1F5F9] truncate max-w-[160px] sm:max-w-[240px]">
              {otherUser?.display_name || 'Chat'}
            </h3>
            {otherUser?.profile_id && (
              <span className="hidden sm:inline font-mono text-[10px] text-[#94A3B8] shrink-0">
                {otherUser.profile_id}
              </span>
            )}
          </div>
          <div className="text-[11px] leading-tight text-[#94A3B8] flex items-center gap-1.5 mt-0.5">
            {otherUserTyping ? (
              <span className="text-[#F472B6] font-medium">Typing...</span>
            ) : otherUser?.is_online ? (
              <span className="text-emerald-400 font-medium">Online</span>
            ) : (
              <span>Offline</span>
            )}
          </div>
        </div>
      </div>

      {/* Unobtrusive Reconnecting Pill */}
      {!isWsConnected && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-medium shrink-0 mr-1">
          <WifiOff className="w-3.5 h-3.5 animate-pulse motion-reduce:animate-none" />
          <span className="hidden sm:inline">Reconnecting</span>
        </div>
      )}
    </header>
  );
});

export default ChatHeader;

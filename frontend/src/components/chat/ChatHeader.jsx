import React from 'react';
import { ArrowLeft, WifiOff } from 'lucide-react';
import { getOptimizedImageUrl } from '../../utils/imageUtils';

export const ChatHeader = React.memo(({ otherUser, otherUserTyping, isWsConnected, onBack }) => {
  return (
    <div className="px-4 md:px-5 py-3 md:py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 sm:gap-4 shrink-0 pt-safe">
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        <button
          onClick={onBack}
          className="p-2 -ml-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
          {otherUser?.profile_picture ? (
            <img
              src={getOptimizedImageUrl(otherUser.profile_picture, { width: 88, height: 88 })}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center font-bold text-base sm:text-lg text-pink-400 bg-pink-500/10">
              {otherUser?.display_name?.charAt(0) || 'U'}
            </div>
          )}
          {otherUser?.is_online && (
            <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <h3 className="font-bold text-sm text-white truncate max-w-[130px] sm:max-w-[200px]">
              {otherUser?.display_name || 'Chat'}
            </h3>
            <span className="font-mono text-[10px] sm:text-xs text-pink-400 font-semibold shrink-0">
              {otherUser?.profile_id}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            {otherUserTyping ? (
              <span className="text-pink-400 font-medium animate-pulse">Typing...</span>
            ) : otherUser?.is_online ? (
              <span className="text-emerald-400 font-medium">Online</span>
            ) : (
              <span>Offline</span>
            )}
          </div>
        </div>
      </div>

      {/* Reconnect Status Banner */}
      {!isWsConnected && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs shrink-0">
          <WifiOff className="w-3.5 h-3.5 animate-pulse" />
          <span className="hidden sm:inline">Reconnecting...</span>
        </div>
      )}
    </div>
  );
});

export default ChatHeader;

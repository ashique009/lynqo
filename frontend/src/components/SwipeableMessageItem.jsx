import React, { useState, useRef, useCallback } from 'react';
import {
  MoreVertical, Check, CheckCheck, Clock, AlertCircle, Ban, CornerUpLeft, Reply
} from 'lucide-react';
import { VoiceMessage } from './VoiceMessage';
import { ChatImageMessage } from './ChatImageMessage';

const SWIPE_THRESHOLD = 38; // px offset to trigger reply
const MAX_SWIPE_OFFSET = 60; // px maximum visual resistance

export const SwipeableMessageItem = ({
  message,
  isMe,
  isEditing,
  editingText,
  setEditingText,
  handleSaveEdit,
  handleCancelEdit,
  handleRetry,
  handleRetryImage,
  setViewerMessage,
  formatMessageTime,
  onThreeDotClick,
  onReply,
  onJumpToReply,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onContextMenu,
}) => {
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isSwipingHorizontal = useRef(false);
  const hasDeterminedDirection = useRef(false);
  const thresholdTriggered = useRef(false);

  // Gesture Handlers
  const handlePointerDown = (e) => {
    // Only handle primary pointer (left click or touch)
    if (e.button !== undefined && e.button !== 0) return;
    // Don't drag while editing or if clicking inside button or input
    if (isEditing || e.target.closest('button, input, textarea, a')) return;

    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    isSwipingHorizontal.current = false;
    hasDeterminedDirection.current = false;
    thresholdTriggered.current = false;
    setIsDragging(true);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;

    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    // Determine swipe direction after small initial movement threshold (8px)
    if (!hasDeterminedDirection.current) {
      if (Math.hypot(dx, dy) > 8) {
        hasDeterminedDirection.current = true;
        // Swipe right only (dx > 0) with dominant horizontal movement
        if (dx > 0 && Math.abs(dx) > Math.abs(dy)) {
          isSwipingHorizontal.current = true;
        } else {
          // Vertical scroll detected: release horizontal capture
          isSwipingHorizontal.current = false;
          setIsDragging(false);
          setOffsetX(0);
          return;
        }
      } else {
        return;
      }
    }

    if (isSwipingHorizontal.current) {
      // Damped displacement
      const clampedOffset = Math.min(Math.max(0, dx * 0.45), MAX_SWIPE_OFFSET);
      setOffsetX(clampedOffset);

      if (clampedOffset >= SWIPE_THRESHOLD && !thresholdTriggered.current) {
        thresholdTriggered.current = true;
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(10);
          } catch (_) {}
        }
      } else if (clampedOffset < SWIPE_THRESHOLD && thresholdTriggered.current) {
        thresholdTriggered.current = false;
      }
    }
  };

  const handlePointerEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    if (isSwipingHorizontal.current && thresholdTriggered.current) {
      if (onReply) {
        onReply(message);
      }
    }

    // Reset with smooth CSS transition
    setOffsetX(0);
    isSwipingHorizontal.current = false;
    hasDeterminedDirection.current = false;
    thresholdTriggered.current = false;
  };

  const progress = Math.min(offsetX / SWIPE_THRESHOLD, 1);

  return (
    <div
      id={`msg-${message.id}`}
      className={`flex flex-col group relative ${isMe ? 'items-end' : 'items-start'} ${isDragging && isSwipingHorizontal.current ? 'select-none' : 'select-text'}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onTouchStart={onTouchStart ? (e) => onTouchStart(message, e) : undefined}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onContextMenu={onContextMenu ? (e) => onContextMenu(message, e) : undefined}
      style={{ touchAction: 'pan-y' }}
    >
      {/* Swipe to Reply Indicator Badge (Sliding in from Left) */}
      <div
        style={{
          opacity: progress,
          transform: `translateX(${Math.max(0, offsetX - 42)}px) scale(${0.7 + progress * 0.35})`,
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease',
        }}
        className="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-pink-500/20 border border-pink-500/50 text-pink-400 flex items-center justify-center pointer-events-none z-10 shadow-lg shadow-pink-500/20"
      >
        <Reply className={`w-4 h-4 transition-transform duration-150 ${progress >= 1 ? 'scale-110 text-white' : ''}`} />
      </div>

      <div
        className="flex items-center gap-1 max-w-[85%] sm:max-w-[75%]"
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
      >
        {/* Left 3-dot trigger for outgoing messages */}
        {isMe && !message.is_deleted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onThreeDotClick(message, e);
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-opacity cursor-pointer shrink-0"
            title="Message options"
            aria-label="Message options"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        )}

        <div
          className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm break-words relative transition-all ${
            isMe
              ? 'bg-gradient-to-r from-pink-500 to-indigo-600 text-white rounded-br-xs shadow-pink-500/10'
              : 'bg-slate-800 border border-slate-700/60 text-slate-100 rounded-bl-xs'
          }`}
        >
          {/* Quoted Reply Preview Card (Click to Jump) */}
          {message.reply_to_details && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onJumpToReply?.(message.reply_to_details.id);
              }}
              className={`mb-2 p-2 rounded-xl text-xs cursor-pointer transition-all flex items-start gap-2.5 relative overflow-hidden select-none border ${
                isMe
                  ? 'bg-black/25 border-white/20 hover:bg-black/35 text-white/90'
                  : 'bg-slate-900/60 border-slate-700/80 hover:bg-slate-900/90 text-slate-200'
              }`}
              title="Click to jump to original message"
            >
              <div
                className={`absolute left-0 top-0 bottom-0 w-1 ${
                  isMe ? 'bg-pink-300' : 'bg-gradient-to-b from-pink-500 to-indigo-500'
                }`}
              />
              <div className="flex-grow pl-1 overflow-hidden min-w-0">
                <div className="font-semibold text-[11px] truncate text-pink-300">
                  {message.reply_to_details.sender_display_name || message.reply_to_details.sender_profile_id || 'User'}
                </div>
                <div className="text-[11px] opacity-85 truncate mt-0.5">
                  {message.reply_to_details.is_deleted ? (
                    <span className="italic flex items-center gap-1 opacity-70">
                      <Ban className="w-3 h-3 inline shrink-0" /> This message was deleted
                    </span>
                  ) : (
                    message.reply_to_details.content ||
                    (message.reply_to_details.message_type === 'image'
                      ? '📷 Photo'
                      : message.reply_to_details.message_type === 'voice'
                      ? `🎤 Voice message ${message.reply_to_details.duration_seconds ? `(${message.reply_to_details.duration_seconds}s)` : ''}`
                      : 'Message')
                  )}
                </div>
              </div>
              {message.reply_to_details.thumbnail_url && !message.reply_to_details.is_deleted && (
                <img
                  src={message.reply_to_details.thumbnail_url}
                  alt="Thumbnail"
                  className="w-8 h-8 rounded-md object-cover shrink-0 border border-white/10"
                />
              )}
            </div>
          )}

          {/* Message Content */}
          {message.is_deleted ? (
            <div className="flex items-center gap-1.5 italic text-xs opacity-70 py-0.5">
              <Ban className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>This message was deleted</span>
            </div>
          ) : isEditing ? (
            <div className="flex flex-col gap-2 min-w-[200px] sm:min-w-[260px] py-1">
              <textarea
                value={editingText}
                onChange={(e) => setEditingText(e.target.value)}
                className="w-full p-2 text-xs sm:text-sm bg-slate-950/70 border border-pink-400/50 rounded-xl text-white resize-none focus:outline-none focus:ring-1 focus:ring-pink-400"
                rows={2}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit(message.id);
                  }
                }}
              />
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-700/60 text-slate-300 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveEdit(message.id)}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-pink-500 hover:bg-pink-600 text-white shadow transition-colors cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          ) : message.message_type === 'voice' ? (
            <VoiceMessage
              message={message}
              isMe={isMe}
              formatTime={formatMessageTime}
            />
          ) : message.message_type === 'image' ? (
            <ChatImageMessage
              message={message}
              isMe={isMe}
              onImageClick={(m) => setViewerMessage(m)}
              onRetry={handleRetryImage}
            />
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}

          {/* Message Footer (Timestamp & Status Ticks) */}
          <div
            className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
              isMe ? 'text-pink-100/70' : 'text-slate-400'
            }`}
          >
            <span>{formatMessageTime(message.created_at)}</span>
            {message.is_edited && !message.is_deleted && (
              <span className="italic text-[9px] opacity-80">(edited)</span>
            )}
            {isMe && !message.is_deleted && (
              <span className="ml-1 inline-flex items-center">
                {message.status === 'failed' ? (
                  <button
                    type="button"
                    onClick={() => handleRetry(message)}
                    className="inline-flex items-center gap-1 text-rose-300 hover:text-white bg-rose-500/20 hover:bg-rose-500/30 px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors"
                    title="Sending failed. Click to retry."
                    aria-label="Retry sending message"
                  >
                    <AlertCircle className="w-3 h-3 text-rose-400" />
                    <span className="font-semibold underline">Retry</span>
                  </button>
                ) : message.status === 'sending' ? (
                  <Clock className="w-3 h-3 animate-spin text-pink-200/50" title="Sending..." />
                ) : message.status === 'seen' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-pink-200 font-bold" title="Seen" />
                ) : message.status === 'delivered' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-slate-400/80" title="Delivered" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-pink-200/60" title="Sent" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Right 3-dot trigger for incoming messages */}
        {!isMe && !message.is_deleted && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onThreeDotClick(message, e);
            }}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60 transition-opacity cursor-pointer shrink-0"
            title="Message options"
            aria-label="Message options"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

import React, { useRef, useEffect, useCallback } from 'react';
import {
  MoreVertical, Check, CheckCheck, Clock, AlertCircle, Ban, CornerUpLeft, Reply
} from 'lucide-react';
import { VoiceMessage } from './VoiceMessage';
import { ChatImageMessage } from './ChatImageMessage';

const SWIPE_THRESHOLD = 38; // px offset to trigger reply
const MAX_SWIPE_OFFSET = 60; // px maximum visual resistance

export const SwipeableMessageItem = React.memo(({
  message,
  isMe,
  isFirstInGroup = true,
  isLastInGroup = true,
  optimizeOffscreen = true,
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
  const rowRef = useRef(null);
  const bubbleWrapRef = useRef(null);
  const badgeRef = useRef(null);
  const badgeIconRef = useRef(null);

  const isDraggingRef = useRef(false);
  const offsetXRef = useRef(0);
  const rafRef = useRef(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isSwipingHorizontal = useRef(false);
  const hasDeterminedDirection = useRef(false);
  const thresholdTriggered = useRef(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const applyTransform = useCallback((x, dragging) => {
    const progress = Math.min(x / SWIPE_THRESHOLD, 1);
    if (bubbleWrapRef.current) {
      bubbleWrapRef.current.style.transition = dragging || prefersReducedMotion
        ? 'none'
        : 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
      bubbleWrapRef.current.style.transform = `translate3d(${x}px, 0, 0)`;
    }
    if (badgeRef.current) {
      badgeRef.current.style.transition = dragging || prefersReducedMotion
        ? 'none'
        : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease';
      badgeRef.current.style.opacity = String(progress);
      badgeRef.current.style.transform = `translate3d(${Math.max(0, x - 42)}px, -50%, 0) scale(${0.7 + progress * 0.35})`;
    }
    if (badgeIconRef.current) {
      if (progress >= 1) {
        badgeIconRef.current.classList.add('scale-110', 'text-white');
      } else {
        badgeIconRef.current.classList.remove('scale-110', 'text-white');
      }
    }
  }, [prefersReducedMotion]);

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Gesture Handlers
  const handlePointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    if (isEditing || e.target.closest('button, input, textarea, a')) return;

    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    isSwipingHorizontal.current = false;
    hasDeterminedDirection.current = false;
    thresholdTriggered.current = false;
    isDraggingRef.current = true;
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current) return;

    const dx = e.clientX - startXRef.current;
    const dy = e.clientY - startYRef.current;

    // Determine swipe direction after small initial movement threshold (10px prevents accidental trigger)
    if (!hasDeterminedDirection.current) {
      if (Math.hypot(dx, dy) > 10) {
        hasDeterminedDirection.current = true;
        if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          isSwipingHorizontal.current = true;
          if (rowRef.current) rowRef.current.classList.add('select-none');
        } else {
          isSwipingHorizontal.current = false;
          isDraggingRef.current = false;
          offsetXRef.current = 0;
          applyTransform(0, false);
          return;
        }
      } else {
        return;
      }
    }

    if (isSwipingHorizontal.current) {
      const clampedOffset = Math.min(Math.max(0, dx * 0.45), MAX_SWIPE_OFFSET);
      offsetXRef.current = clampedOffset;

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          applyTransform(offsetXRef.current, true);
        });
      }

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
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (rowRef.current) {
      rowRef.current.classList.remove('select-none');
    }

    if (isSwipingHorizontal.current && thresholdTriggered.current) {
      if (onReply) {
        onReply(message);
      }
    }

    offsetXRef.current = 0;
    applyTransform(0, false);
    isSwipingHorizontal.current = false;
    hasDeterminedDirection.current = false;
    thresholdTriggered.current = false;
  };

  // Soft 22px rounded bubbles; refined corner tail on final message in same-sender group
  const bubbleShapeClass = isLastInGroup
    ? isMe
      ? 'rounded-[22px] rounded-br-[6px]'
      : 'rounded-[22px] rounded-bl-[6px]'
    : 'rounded-[22px]';
  const showFooter = isLastInGroup || message.status === 'failed';

  return (
    <div
      ref={rowRef}
      id={`msg-${message.id}`}
      className={`${optimizeOffscreen ? 'message-row-opt ' : ''}flex flex-col group relative select-text ${isFirstInGroup ? 'mt-3' : 'mt-1'} ${isMe ? 'items-end' : 'items-start'}`}
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
        ref={badgeRef}
        style={{
          opacity: 0,
          transform: 'translate3d(0px, -50%, 0) scale(0.7)',
          willChange: 'transform, opacity',
        }}
        className="absolute left-0 top-1/2 w-8 h-8 rounded-full bg-white/95 dark:bg-[#1E293B] border border-[#9880D9]/40 text-[#7960BC] dark:text-[#F472B6] flex items-center justify-center pointer-events-none z-10 shadow-md"
      >
        <Reply ref={badgeIconRef} className="w-4 h-4 transition-transform duration-150" />
      </div>

      <div
        ref={bubbleWrapRef}
        className="flex flex-col max-w-[82%] sm:max-w-[74%] min-w-0 px-1"
        style={{
          transform: 'translate3d(0px, 0, 0)',
          willChange: 'transform',
        }}
      >
        <div className="flex items-center gap-1 min-w-0">
          {/* Left 3-dot trigger for outgoing messages */}
          {isMe && !message.is_deleted && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onThreeDotClick(message, e);
              }}
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#93889D] hover:text-[#38323F] dark:text-slate-400 dark:hover:text-white rounded-xl hover:bg-black/5 dark:hover:bg-slate-800/60 transition-opacity cursor-pointer shrink-0"
              title="Message options"
              aria-label="Message options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}

          <div className="relative min-w-0 max-w-full">
            <div
              className={`min-w-0 max-w-full overflow-hidden px-4 py-2.5 text-[16px] leading-[22px] text-white relative transition-transform duration-150 active:scale-[0.985] ${bubbleShapeClass} ${
                isMe ? 'liquid-glass-bubble-out' : 'liquid-glass-bubble-in'
              }`}
            >
          {/* Quoted Reply Preview Card (Click to Jump) */}
          {message.reply_to_details && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onJumpToReply?.(message.reply_to_details.id);
              }}
              className={`mb-2 px-3 py-2 rounded-[14px] text-xs cursor-pointer transition-colors flex items-start gap-2 relative overflow-hidden select-none border ${
                isMe
                  ? 'bg-[#120A20]/30 hover:bg-[#120A20]/45 border-white/15 text-white'
                  : 'bg-white/[0.07] hover:bg-white/[0.12] border-white/12 text-white'
              }`}
              title="Click to jump to original message"
            >
              <div className="flex-grow overflow-hidden min-w-0">
                <div className="font-semibold text-[13px] leading-tight truncate text-white">
                  {message.reply_to_details.sender_display_name || message.reply_to_details.sender_profile_id || 'User'}
                </div>
                <div className="text-[13px] leading-snug truncate mt-0.5 text-white/85">
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
                  width="32"
                  height="32"
                  loading="lazy"
                  className="w-8 h-8 rounded-md object-cover shrink-0 border border-white/15"
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
                aria-label="Edit message"
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
                  className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-gradient-to-r from-[#8B68F6] to-[#EC6EB8] hover:opacity-95 text-white shadow transition-all cursor-pointer"
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
              onImageClick={setViewerMessage}
              onRetry={handleRetryImage}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
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
              className="opacity-0 group-hover:opacity-100 focus:opacity-100 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-opacity cursor-pointer shrink-0"
              title="Message options"
              aria-label="Message options"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Timestamp & Status Ticks outside and below the message / group */}
        {showFooter && (
          <div
            className={`flex items-center gap-1 text-[11px] leading-none tabular-nums mt-1 px-1 ${
              isMe ? 'justify-end text-[#93889D] dark:text-[#B4A7C2]' : 'justify-start text-[#93889D] dark:text-[#94A3B8]'
            }`}
          >
            <span>{formatMessageTime(message.created_at)}</span>
            {message.is_edited && !message.is_deleted && (
              <span className="italic text-[10px] opacity-80">(edited)</span>
            )}
            {isMe && !message.is_deleted && (
              <span className="ml-0.5 inline-flex items-center">
                {message.status === 'failed' ? (
                  <button
                    type="button"
                    onClick={() => handleRetry(message)}
                    className="inline-flex items-center gap-1 text-rose-500 dark:text-rose-300 hover:underline px-1 py-0.5 rounded text-[11px] cursor-pointer"
                    title="Sending failed. Click to retry."
                    aria-label="Retry sending message"
                  >
                    <AlertCircle className="w-3 h-3" />
                    <span className="font-semibold">Retry</span>
                  </button>
                ) : message.status === 'sending' ? (
                  <Clock className="w-3 h-3 animate-spin opacity-60" title="Sending..." />
                ) : message.status === 'seen' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-[#9880D9] dark:text-sky-300" title="Seen" />
                ) : message.status === 'delivered' ? (
                  <CheckCheck className="w-3.5 h-3.5 opacity-75" title="Delivered" />
                ) : (
                  <Check className="w-3.5 h-3.5 opacity-65" title="Sent" />
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

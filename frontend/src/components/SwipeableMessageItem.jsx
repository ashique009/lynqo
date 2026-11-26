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

  const bubbleShapeClass = isMe
    ? `rounded-[18px] ${isFirstInGroup ? '' : 'rounded-tr-[6px]'} ${isLastInGroup ? 'rounded-br-[5px]' : 'rounded-br-[6px]'}`
    : `rounded-[18px] ${isFirstInGroup ? '' : 'rounded-tl-[6px]'} ${isLastInGroup ? 'rounded-bl-[5px]' : 'rounded-bl-[6px]'}`;

  return (
    <div
      ref={rowRef}
      id={`msg-${message.id}`}
      className={`message-row-opt flex flex-col group relative select-text ${isFirstInGroup ? 'mt-3' : 'mt-[3px]'} ${isMe ? 'items-end' : 'items-start'}`}
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
        className="absolute left-0 top-1/2 w-8 h-8 rounded-full bg-pink-500/20 border border-pink-500/50 text-pink-400 flex items-center justify-center pointer-events-none z-10 shadow-lg shadow-pink-500/20"
      >
        <Reply ref={badgeIconRef} className="w-4 h-4 transition-transform duration-150" />
      </div>

      <div
        ref={bubbleWrapRef}
        className="flex items-center gap-1 max-w-[82%] sm:max-w-[72%] min-w-0"
        style={{
          transform: 'translate3d(0px, 0, 0)',
          willChange: 'transform',
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
          className={`min-w-0 max-w-full overflow-hidden px-3.5 py-2 text-[15px] leading-[1.38] relative transition-transform duration-150 active:scale-[0.985] ${bubbleShapeClass} ${
            isMe
              ? 'bg-[#6848D8] text-[#F8FAFC]'
              : 'bg-[#1E293B] border border-white/[0.05] text-[#F1F5F9]'
          }`}
        >
          {/* Quoted Reply Preview Card (Click to Jump) */}
          {message.reply_to_details && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                onJumpToReply?.(message.reply_to_details.id);
              }}
              className={`mb-1.5 px-2.5 py-1.5 rounded-xl text-xs cursor-pointer transition-colors flex items-start gap-2 relative overflow-hidden select-none ${
                isMe
                  ? 'bg-black/20 hover:bg-black/30 text-white/95'
                  : 'bg-[#0F172A]/70 hover:bg-[#0F172A]/90 text-[#E2E8F0]'
              }`}
              title="Click to jump to original message"
            >
              <div
                className={`absolute left-0 top-0 bottom-0 w-[2.5px] ${
                  isMe ? 'bg-white/60' : 'bg-[#7957F5]'
                }`}
              />
              <div className="flex-grow pl-1 overflow-hidden min-w-0">
                <div className={`font-semibold text-[11px] truncate ${isMe ? 'text-white/95' : 'text-[#F472B6]'}`}>
                  {message.reply_to_details.sender_display_name || message.reply_to_details.sender_profile_id || 'User'}
                </div>
                <div className="text-[11px] opacity-80 truncate mt-0.5">
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
            <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>
          )}

          {/* Message Footer (Timestamp & Status Ticks) */}
          <div
            className={`flex items-center justify-end gap-1 text-[10px] tabular-nums mt-1 ${
              isMe ? 'text-white/75' : 'text-[#94A3B8]'
            }`}
          >
            <span>{formatMessageTime(message.created_at)}</span>
            {message.is_edited && !message.is_deleted && (
              <span className="italic text-[9px] opacity-80">(edited)</span>
            )}
            {isMe && !message.is_deleted && (
              <span className="ml-0.5 inline-flex items-center">
                {message.status === 'failed' ? (
                  <button
                    type="button"
                    onClick={() => handleRetry(message)}
                    className="inline-flex items-center gap-1 text-rose-200 hover:text-white bg-rose-500/25 hover:bg-rose-500/40 px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors"
                    title="Sending failed. Click to retry."
                    aria-label="Retry sending message"
                  >
                    <AlertCircle className="w-3 h-3 text-rose-300" />
                    <span className="font-semibold underline">Retry</span>
                  </button>
                ) : message.status === 'sending' ? (
                  <Clock className="w-3 h-3 animate-spin text-white/60" title="Sending..." />
                ) : message.status === 'seen' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-sky-300" title="Seen" />
                ) : message.status === 'delivered' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-white/75" title="Delivered" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-white/65" title="Sent" />
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
});

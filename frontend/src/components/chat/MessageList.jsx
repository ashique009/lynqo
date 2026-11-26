import React, { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import { SwipeableMessageItem } from '../SwipeableMessageItem';

const INITIAL_RENDER_WINDOW = 250;
const WINDOW_STEP = 200;

const formatDateLabel = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - target) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
};

const ChatSkeleton = () => (
  <div className="space-y-3 p-2 animate-pulse" role="status" aria-label="Loading messages">
    <div className="flex flex-col items-start space-y-1">
      <div className="h-10 w-44 sm:w-52 rounded-[20px] rounded-bl-[5px] bg-white/80 dark:bg-slate-800/70" />
    </div>
    <div className="flex flex-col items-end space-y-1">
      <div className="h-12 w-52 sm:w-64 rounded-[20px] rounded-br-[5px] bg-[#9880D9]/25 dark:bg-indigo-600/20" />
    </div>
    <div className="flex flex-col items-start space-y-1">
      <div className="h-14 w-60 sm:w-72 rounded-[20px] rounded-bl-[5px] bg-white/80 dark:bg-slate-800/70" />
    </div>
    <div className="flex flex-col items-end space-y-1">
      <div className="h-10 w-36 sm:w-44 rounded-[20px] rounded-br-[5px] bg-[#9880D9]/25 dark:bg-indigo-600/20" />
    </div>
  </div>
);

export const MessageList = React.memo(({
  chatContainerRef,
  messagesEndRef,
  onScroll,
  loadingOlder,
  isLoading,
  isPositionReady = true,
  messages,
  unreadBannerInfo,
  otherUser,
  otherUserTyping,
  currentProfileId,
  editingMessageId,
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
  const [renderLimit, setRenderLimit] = useState(INITIAL_RENDER_WINDOW);

  // Keep render window bounded on long conversations while ensuring firstUnreadId is visible
  useEffect(() => {
    if (unreadBannerInfo?.firstUnreadId) {
      const idx = messages.findIndex((m) => m.id === unreadBannerInfo.firstUnreadId);
      if (idx !== -1) {
        const needed = messages.length - idx + 20;
        if (needed > renderLimit) {
          setRenderLimit(needed);
          return;
        }
      }
    }
    if (messages.length <= INITIAL_RENDER_WINDOW && renderLimit !== INITIAL_RENDER_WINDOW) {
      setRenderLimit(INITIAL_RENDER_WINDOW);
    }
  }, [messages, unreadBannerInfo, renderLimit]);

  const hiddenCount = Math.max(0, messages.length - renderLimit);
  const visibleMessages = hiddenCount > 0 ? messages.slice(hiddenCount) : messages;

  return (
    <div
      ref={chatContainerRef}
      onScroll={onScroll}
      style={{ opacity: isLoading || messages.length === 0 || isPositionReady ? 1 : 0 }}
      className="flex-grow rounded-t-[24px] z-10 px-3 sm:px-4 md:px-6 pt-4 pb-28 overflow-y-auto overflow-x-hidden bg-transparent relative min-h-0 overscroll-contain"
    >
      {loadingOlder && (
        <div className="py-2 text-center text-xs text-[#93889D] dark:text-[#94A3B8]">
          Loading older messages...
        </div>
      )}

      {isLoading && messages.length === 0 ? (
        <ChatSkeleton />
      ) : messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-[#93889D] dark:text-[#94A3B8] space-y-2 py-8">
          <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#111827] border border-black/[0.05] dark:border-white/[0.08] text-[#7960BC] dark:text-[#7957F5] flex items-center justify-center shadow-xs">
            <Send className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-[#38323F] dark:text-[#F1F5F9]">No messages yet</p>
          <p className="text-xs">Send a message to say hello to {otherUser?.display_name}!</p>
        </div>
      ) : (
        <>
          {hiddenCount > 0 && (
            <div className="flex justify-center my-2">
              <button
                type="button"
                onClick={() => setRenderLimit((prev) => prev + WINDOW_STEP)}
                className="px-3.5 py-1.5 rounded-full bg-[#241B35]/80 hover:bg-[#2F2445] border border-white/15 text-[12px] font-medium text-[#D8CCF0] transition-colors cursor-pointer"
              >
                Show {Math.min(hiddenCount, WINDOW_STEP)} earlier messages ({hiddenCount} hidden)
              </button>
            </div>
          )}
          {visibleMessages.map((msg, index) => {
          const isMe = msg.sender_profile_id === currentProfileId;
          const isEditing = editingMessageId === msg.id;
          const prevMsg = index > 0 ? visibleMessages[index - 1] : null;
          const nextMsg = index < visibleMessages.length - 1 ? visibleMessages[index + 1] : null;

          const curTs = msg.created_at ? Date.parse(msg.created_at) : 0;
          const prevTs = prevMsg?.created_at ? Date.parse(prevMsg.created_at) : 0;
          const nextTs = nextMsg?.created_at ? Date.parse(nextMsg.created_at) : 0;

          const curDayKey = msg.created_at ? msg.created_at.slice(0, 10) : '';
          const prevDayKey = prevMsg?.created_at ? prevMsg.created_at.slice(0, 10) : '';
          const showDateSeparator = curDayKey && curDayKey !== prevDayKey;

          const sameAsPrev =
            prevMsg &&
            !showDateSeparator &&
            prevMsg.sender_profile_id === msg.sender_profile_id &&
            Math.abs(curTs - prevTs) < 120000;
          const sameAsNext =
            nextMsg &&
            nextMsg.sender_profile_id === msg.sender_profile_id &&
            Math.abs(nextTs - curTs) < 120000;

          return (
            <React.Fragment key={msg.client_message_id || msg.id || index}>
              {showDateSeparator && (
                <div className="flex justify-center my-3">
                  <span className="px-3.5 py-1 rounded-full bg-[#241B35]/75 border border-white/10 text-[12px] font-medium text-[#C4B8D4] shadow-xs">
                    {formatDateLabel(msg.created_at)}
                  </span>
                </div>
              )}
              {unreadBannerInfo?.firstUnreadId && msg.id === unreadBannerInfo.firstUnreadId && (
                <div id="unread-divider" className="flex items-center gap-3 my-3 px-1">
                  <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />
                  <span className="px-3.5 py-1 rounded-full bg-[#2A1E42]/85 border border-white/15 text-[12px] font-medium text-[#E9D5FF] shadow-xs">
                    {unreadBannerInfo.count}{' '}
                    {unreadBannerInfo.count === 1 ? 'unread message' : 'unread messages'}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
                </div>
              )}
              <SwipeableMessageItem
                message={msg}
                isMe={isMe}
                isFirstInGroup={!sameAsPrev}
                isLastInGroup={!sameAsNext}
                optimizeOffscreen={index < visibleMessages.length - 20}
                isEditing={isEditing}
                editingText={isEditing ? editingText : ''}
                setEditingText={setEditingText}
                handleSaveEdit={handleSaveEdit}
                handleCancelEdit={handleCancelEdit}
                handleRetry={handleRetry}
                handleRetryImage={handleRetryImage}
                setViewerMessage={setViewerMessage}
                formatMessageTime={formatMessageTime}
                onThreeDotClick={onThreeDotClick}
                onReply={onReply}
                onJumpToReply={onJumpToReply}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                onContextMenu={onContextMenu}
              />
            </React.Fragment>
          );
        })}
        </>
      )}

      {/* Real-time typing bubble */}
      {otherUserTyping && (
        <div className="mt-2.5 flex items-center gap-1.5 px-3.5 py-2.5 rounded-[22px] rounded-bl-[6px] liquid-glass-bubble-in text-[#E9D5FF] text-xs w-16">
          <span className="w-1.5 h-1.5 bg-[#E9D5FF] rounded-full animate-bounce [animation-delay:-0.3s] motion-reduce:animate-none" />
          <span className="w-1.5 h-1.5 bg-[#E9D5FF] rounded-full animate-bounce [animation-delay:-0.15s] motion-reduce:animate-none" />
          <span className="w-1.5 h-1.5 bg-[#E9D5FF] rounded-full animate-bounce motion-reduce:animate-none" />
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
});

export default MessageList;

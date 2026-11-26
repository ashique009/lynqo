import React from 'react';
import { Send } from 'lucide-react';
import { SwipeableMessageItem } from '../SwipeableMessageItem';

const ChatSkeleton = () => (
  <div className="space-y-4 p-2 animate-pulse" role="status" aria-label="Loading messages">
    <div className="flex flex-col items-start space-y-1">
      <div className="h-10 w-44 sm:w-52 rounded-2xl rounded-bl-xs bg-slate-800/70 border border-slate-700/40" />
      <div className="h-3 w-14 bg-slate-800/40 rounded-full ml-1" />
    </div>
    <div className="flex flex-col items-end space-y-1">
      <div className="h-12 w-52 sm:w-64 rounded-2xl rounded-br-xs bg-gradient-to-r from-pink-500/20 to-indigo-600/20 border border-pink-500/10" />
      <div className="h-3 w-12 bg-slate-800/40 rounded-full mr-1" />
    </div>
    <div className="flex flex-col items-start space-y-1">
      <div className="h-14 w-60 sm:w-72 rounded-2xl rounded-bl-xs bg-slate-800/70 border border-slate-700/40" />
      <div className="h-3 w-16 bg-slate-800/40 rounded-full ml-1" />
    </div>
    <div className="flex flex-col items-end space-y-1">
      <div className="h-10 w-36 sm:w-44 rounded-2xl rounded-br-xs bg-gradient-to-r from-pink-500/20 to-indigo-600/20 border border-pink-500/10" />
      <div className="h-3 w-12 bg-slate-800/40 rounded-full mr-1" />
    </div>
  </div>
);

export const MessageList = React.memo(({
  chatContainerRef,
  messagesEndRef,
  onScroll,
  loadingOlder,
  isLoading,
  messages,
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
  return (
    <div
      ref={chatContainerRef}
      onScroll={onScroll}
      className="flex-grow px-3 sm:px-4 md:px-6 py-3 overflow-y-auto overflow-x-hidden bg-[#080C14] relative min-h-0 overscroll-contain"
    >
      {loadingOlder && (
        <div className="py-2 text-center text-xs text-[#94A3B8]">
          Loading older messages...
        </div>
      )}

      {isLoading && messages.length === 0 ? (
        <ChatSkeleton />
      ) : messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-[#94A3B8] space-y-2 py-8">
          <div className="w-12 h-12 rounded-2xl bg-[#111827] border border-white/[0.08] text-[#7957F5] flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-[#F1F5F9]">No messages yet</p>
          <p className="text-xs">Send a message to say hello to {otherUser?.display_name}!</p>
        </div>
      ) : (
        messages.map((msg, index) => {
          const isMe = msg.sender_profile_id === currentProfileId;
          const isEditing = editingMessageId === msg.id;
          const prevMsg = index > 0 ? messages[index - 1] : null;
          const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;

          const sameAsPrev =
            prevMsg &&
            prevMsg.sender_profile_id === msg.sender_profile_id &&
            Math.abs(new Date(msg.created_at) - new Date(prevMsg.created_at)) < 120000;
          const sameAsNext =
            nextMsg &&
            nextMsg.sender_profile_id === msg.sender_profile_id &&
            Math.abs(new Date(nextMsg.created_at) - new Date(msg.created_at)) < 120000;

          return (
            <SwipeableMessageItem
              key={msg.client_message_id || msg.id || index}
              message={msg}
              isMe={isMe}
              isFirstInGroup={!sameAsPrev}
              isLastInGroup={!sameAsNext}
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
          );
        })
      )}

      {/* Real-time typing bubble */}
      {otherUserTyping && (
        <div className="mt-2 flex items-center gap-1.5 px-3.5 py-2.5 rounded-[20px] rounded-bl-[6px] bg-[#1E293B] border border-white/[0.06] text-[#94A3B8] text-xs w-16">
          <span className="w-1.5 h-1.5 bg-[#94A3B8] rounded-full animate-bounce [animation-delay:-0.3s] motion-reduce:animate-none" />
          <span className="w-1.5 h-1.5 bg-[#94A3B8] rounded-full animate-bounce [animation-delay:-0.15s] motion-reduce:animate-none" />
          <span className="w-1.5 h-1.5 bg-[#94A3B8] rounded-full animate-bounce motion-reduce:animate-none" />
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
});

export default MessageList;

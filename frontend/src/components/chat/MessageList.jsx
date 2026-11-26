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
      className="flex-grow p-3 sm:p-4 md:p-6 overflow-y-auto space-y-3 bg-gradient-to-b from-slate-950/40 to-slate-900/40 relative min-h-0"
    >
      {loadingOlder && (
        <div className="py-2 text-center text-xs text-slate-500">
          Loading older messages...
        </div>
      )}

      {isLoading && messages.length === 0 ? (
        <ChatSkeleton />
      ) : messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2 py-8">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-pink-400 flex items-center justify-center">
            <Send className="w-5 h-5" />
          </div>
          <p className="text-sm font-semibold text-slate-300">No messages yet</p>
          <p className="text-xs">Send a message to say hello to {otherUser?.display_name}!</p>
        </div>
      ) : (
        messages.map((msg, index) => {
          const isMe = msg.sender_profile_id === currentProfileId;
          const isEditing = editingMessageId === msg.id;
          return (
            <SwipeableMessageItem
              key={msg.client_message_id || msg.id || index}
              message={msg}
              isMe={isMe}
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
        <div className="flex items-center gap-1.5 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/40 text-slate-400 text-xs w-20">
          <span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" />
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
});

export default MessageList;

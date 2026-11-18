import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Check, CheckCheck, Clock,
  ChevronDown, WifiOff, AlertCircle
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { chatService } from '../services/chatService';
import { wsService } from '../services/websocketService';
import { cacheGet, cacheSet } from '../utils/cache';
import { mergeMessages } from '../utils/messageUtils';
import Loader from '../components/Loader';

export const Chat = () => {
  const { conversationId } = useParams();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [conversation, setConversation] = useState(() => cacheGet(`conv_detail_${conversationId}`) || null);
  const [messages, setMessages] = useState(() => cacheGet(`conv_msgs_${conversationId}`) || []);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(() => !cacheGet(`conv_msgs_${conversationId}`));
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [isWsConnected, setIsWsConnected] = useState(wsService.isConnected);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const otherTypingTimeoutRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const activeConvIdRef = useRef(conversationId);
  activeConvIdRef.current = conversationId;

  // 1. Load initial conversation details and message history
  useEffect(() => {
    let isCurrent = true;
    const currentId = conversationId;

    // Immediately synchronize view with current conversation state/cache
    const cachedConv = cacheGet(`conv_detail_${currentId}`);
    const cachedMsgs = cacheGet(`conv_msgs_${currentId}`);
    setConversation(cachedConv || null);
    setMessages(cachedMsgs || []);
    setIsLoading(!cachedMsgs);
    setOtherUserTyping(false);
    setInputText('');

    // Join conversation room via WebSocket
    wsService.joinConversation(currentId);

    const loadInitialData = async () => {
      try {
        const [convRes, msgRes] = await Promise.all([
          chatService.getConversationDetail(currentId),
          chatService.getMessages(currentId, { limit: 50 }),
        ]);

        if (!isCurrent || activeConvIdRef.current !== currentId) {
          // Stale response from a previously active conversation: drop it
          return;
        }

        if (convRes.success) {
          setConversation(convRes.conversation);
          cacheSet(`conv_detail_${currentId}`, convRes.conversation, 120);
        }
        if (msgRes.success) {
          const msgs = msgRes.messages || [];
          setMessages((prev) => {
            if (!isCurrent || activeConvIdRef.current !== currentId) return prev;
            const merged = mergeMessages(prev, msgs);
            cacheSet(`conv_msgs_${currentId}`, merged, 60);
            return merged;
          });
          setHasMore(msgRes.has_more);
        }
      } catch (err) {
        if (!isCurrent || activeConvIdRef.current !== currentId) return;
        showToast(err.message || 'Failed to load conversation.', 'error');
      } finally {
        if (isCurrent && activeConvIdRef.current === currentId) {
          setIsLoading(false);
          setTimeout(scrollToBottom, 100);
        }
      }
    };

    loadInitialData();

    // Listen for WebSocket connection status
    const unsubStatus = wsService.on('connection_status', (data) => {
      setIsWsConnected(data.isConnected);
      if (data.isConnected && isCurrent && activeConvIdRef.current === currentId) {
        syncMissedMessages(currentId);
      }
    });

    // Listen for incoming messages
    const unsubMsg = wsService.on('new_message', (data) => {
      const incomingMsg = data.message;
      if (String(incomingMsg.conversation_id) === String(activeConvIdRef.current)) {
        setMessages((prev) => {
          const merged = mergeMessages(prev, [incomingMsg]);
          cacheSet(`conv_msgs_${activeConvIdRef.current}`, merged, 60);
          return merged;
        });

        // If message is from other user and we are looking at chat, mark seen
        if (incomingMsg.sender_profile_id !== profile?.profile_id) {
          wsService.markSeen(activeConvIdRef.current);
        }

        // Auto-scroll if user is near bottom
        if (isNearBottomRef.current) {
          setTimeout(scrollToBottom, 50);
        } else {
          setShowScrollBottom(true);
        }
      }
    });

    // Listen for message ACK
    const unsubAck = wsService.on('message_ack', (data) => {
      setMessages((prev) => {
        let changed = false;
        const updated = prev.map((m) => {
          if (m.client_message_id === data.client_message_id) {
            changed = true;
            return {
              ...m,
              id: data.message_id,
              status: m.status === 'seen' ? 'seen' : data.status,
            };
          }
          return m;
        });
        if (changed) {
          cacheSet(`conv_msgs_${activeConvIdRef.current}`, updated, 60);
        }
        return updated;
      });
    });

    // Listen for typing indicator
    const unsubTyping = wsService.on('typing_indicator', (data) => {
      if (String(data.conversation_id) === String(activeConvIdRef.current)) {
        setOtherUserTyping(data.is_typing);
        if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
        if (data.is_typing) {
          otherTypingTimeoutRef.current = setTimeout(() => {
            setOtherUserTyping(false);
          }, 3000);
        }
      }
    });

    // Listen for messages seen
    const unsubSeen = wsService.on('messages_seen', (data) => {
      if (String(data.conversation_id) === String(activeConvIdRef.current)) {
        setMessages((prev) => {
          let changed = false;
          const updated = prev.map((m) => {
            if (m.sender_profile_id === profile?.profile_id && m.status !== 'seen') {
              changed = true;
              return { ...m, status: 'seen' };
            }
            return m;
          });
          if (changed) {
            cacheSet(`conv_msgs_${activeConvIdRef.current}`, updated, 60);
          }
          return updated;
        });
      }
    });

    // Listen for presence changes
    const unsubPresence = wsService.on('presence_update', (data) => {
      setConversation((prev) => {
        if (!prev || prev.other_participant?.profile_id !== data.profile_id) return prev;
        return {
          ...prev,
          other_participant: {
            ...prev.other_participant,
            is_online: data.is_online,
            last_seen: data.last_seen,
          },
        };
      });
    });

    return () => {
      isCurrent = false;
      wsService.leaveConversation(currentId);
      unsubStatus();
      unsubMsg();
      unsubAck();
      unsubTyping();
      unsubSeen();
      unsubPresence();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
    };
  }, [conversationId]);

  // Sync missed messages
  const syncMissedMessages = async (targetId = conversationId) => {
    if (messages.length === 0) return;
    const realMsgs = messages.filter((m) => m.id && !String(m.id).startsWith('temp-'));
    if (realMsgs.length === 0) return;
    const latestId = Math.max(...realMsgs.map((m) => Number(m.id)));
    if (!latestId || !isFinite(latestId)) return;

    try {
      const res = await chatService.getMessages(targetId, { since_id: latestId });
      if (res.success && res.messages?.length > 0 && activeConvIdRef.current === targetId) {
        setMessages((prev) => {
          if (activeConvIdRef.current !== targetId) return prev;
          const merged = mergeMessages(prev, res.messages);
          cacheSet(`conv_msgs_${targetId}`, merged, 60);
          return merged;
        });
        if (isNearBottomRef.current) setTimeout(scrollToBottom, 50);
      }
    } catch (e) {
      console.warn('Sync missed messages failed:', e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
  };

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const fromBottom = scrollHeight - scrollTop - clientHeight;
    isNearBottomRef.current = fromBottom < 100;
    setShowScrollBottom(fromBottom >= 150);

    // If scrolled to top, load older messages
    if (scrollTop < 50 && hasMore && !loadingOlder) {
      loadOlderMessages();
    }
  };

  const loadOlderMessages = async () => {
    const targetId = conversationId;
    if (messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    const oldestMsg = messages.find((m) => m.id && !String(m.id).startsWith('temp-'));
    if (!oldestMsg) {
      setLoadingOlder(false);
      return;
    }
    const oldestId = oldestMsg.id;
    try {
      const res = await chatService.getMessages(targetId, { before_id: oldestId, limit: 30 });
      if (res.success && activeConvIdRef.current === targetId) {
        setMessages((prev) => {
          if (activeConvIdRef.current !== targetId) return prev;
          const merged = mergeMessages(prev, res.messages || []);
          cacheSet(`conv_msgs_${targetId}`, merged, 60);
          return merged;
        });
        setHasMore(res.has_more);
      }
    } catch (err) {
      console.error('Failed to load older messages:', err);
    } finally {
      if (activeConvIdRef.current === targetId) {
        setLoadingOlder(false);
      }
    }
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);

    // Typing indicator
    if (!isTyping) {
      setIsTyping(true);
      wsService.sendTyping(conversationId, true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      wsService.sendTyping(conversationId, false);
    }, 1500);
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    const currentId = conversationId;
    const clientMsgId = `cli-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    // Optimistic UI message
    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      client_message_id: clientMsgId,
      conversation_id: Number(currentId),
      sender_profile_id: profile?.profile_id,
      sender_display_name: profile?.display_name,
      content: text,
      status: 'sending',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => {
      const updated = [...prev, optimisticMsg];
      cacheSet(`conv_msgs_${currentId}`, updated, 60);
      return updated;
    });
    setInputText('');
    setIsTyping(false);
    wsService.sendTyping(currentId, false);
    setTimeout(scrollToBottom, 50);

    // Attempt sending via WebSocket
    const sentWs = wsService.sendMessage(currentId, text, clientMsgId);
    if (!sentWs) {
      // Fallback to REST API
      try {
        const res = await chatService.sendMessage(currentId, text, clientMsgId);
        if (res.success && activeConvIdRef.current === currentId) {
          setMessages((prev) => {
            const merged = mergeMessages(prev, [res.message]);
            cacheSet(`conv_msgs_${currentId}`, merged, 60);
            return merged;
          });
        }
      } catch (err) {
        showToast(err.message || 'Failed to send message.', 'error');
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageTime = (isoString) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const otherUser = conversation?.other_participant;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl overflow-hidden backdrop-blur-xl">
      {/* Chat Header */}
      <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative w-11 h-11 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
            {otherUser?.profile_picture ? (
              <img src={otherUser.profile_picture} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-lg text-pink-400 bg-pink-500/10">
                {otherUser?.display_name?.charAt(0) || 'U'}
              </div>
            )}
            {otherUser?.is_online && (
              <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-white">{otherUser?.display_name || 'Chat'}</h3>
              <span className="font-mono text-xs text-pink-400 font-semibold">{otherUser?.profile_id}</span>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              {otherUserTyping ? (
                <span className="text-pink-400 font-medium animate-pulse">Typing...</span>
              ) : otherUser?.is_online ? (
                <span className="text-emerald-400">Online</span>
              ) : (
                <span>Offline</span>
              )}
            </div>
          </div>
        </div>

        {/* Reconnect Status Banner */}
        {!isWsConnected && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
            <WifiOff className="w-3.5 h-3.5 animate-pulse" />
            <span className="hidden sm:inline">Connecting...</span>
          </div>
        )}
      </div>

      {/* Messages Stream */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-grow p-4 md:p-6 overflow-y-auto space-y-3 bg-gradient-to-b from-slate-950/40 to-slate-900/40 relative"
      >
        {loadingOlder && (
          <div className="py-2 text-center text-xs text-slate-500">
            Loading older messages...
          </div>
        )}

        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Loader />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 text-pink-400 flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <p className="text-sm font-semibold text-slate-300">No messages yet</p>
            <p className="text-xs">Send a message to say hello to {otherUser?.display_name}!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender_profile_id === profile?.profile_id;
            return (
              <div
                key={msg.client_message_id || msg.id || index}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] md:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm break-words ${
                    isMe
                      ? 'bg-gradient-to-r from-pink-500 to-indigo-600 text-white rounded-br-xs shadow-pink-500/10'
                      : 'bg-slate-800 border border-slate-700/60 text-slate-100 rounded-bl-xs'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <div
                    className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                      isMe ? 'text-pink-100/70' : 'text-slate-400'
                    }`}
                  >
                    <span>{formatMessageTime(msg.created_at)}</span>
                    {isMe && (
                      <span className="ml-0.5">
                        {msg.status === 'sending' ? (
                          <Clock className="w-3 h-3 animate-spin" />
                        ) : msg.status === 'seen' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-pink-200" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-pink-200/70" />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
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

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-20 right-8 p-2.5 rounded-full bg-pink-500 hover:bg-pink-600 text-white shadow-xl transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer z-10"
        >
          <ChevronDown className="w-4 h-4" />
          <span>New messages</span>
        </button>
      )}

      {/* Bottom Input Field */}
      <form
        onSubmit={handleSendMessage}
        className="p-3 md:p-4 bg-slate-950/80 border-t border-slate-800 flex items-end gap-2 shrink-0"
      >
        <textarea
          rows={1}
          placeholder="Type a message..."
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          className="flex-grow px-4 py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all resize-none max-h-32 leading-relaxed"
        />

        <button
          type="submit"
          disabled={!inputText.trim()}
          className="p-3 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white shadow-lg shadow-pink-500/20 transition-all cursor-pointer shrink-0"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
};

export default Chat;

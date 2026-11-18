import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Send, Check, CheckCheck, Clock,
  ChevronDown, WifiOff, AlertCircle, Mic, Lock, Trash2, Pause, Play, RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { chatService } from '../services/chatService';
import { wsService } from '../services/websocketService';
import { cacheGet, cacheSet } from '../utils/cache';
import { mergeMessages } from '../utils/messageUtils';
import { audioPlayerManager } from '../utils/audioPlayerManager';
import VoiceMessage from '../components/VoiceMessage';
import useVoiceRecorder from '../hooks/useVoiceRecorder';
import Loader from '../components/Loader';

const formatRecordingTime = (sec) => {
  if (!sec || isNaN(sec)) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

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

export const Chat = () => {
  const { conversationId } = useParams();
  const location = useLocation();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [conversation, setConversation] = useState(() => {
    return location.state?.conversation || cacheGet(`conv_detail_${conversationId}`) || null;
  });
  const [messages, setMessages] = useState(() => cacheGet(`conv_msgs_${conversationId}`) || []);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(() => {
    const cached = cacheGet(`conv_msgs_${conversationId}`);
    return !cached || cached.length === 0;
  });
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
        const cachedConvData = location.state?.conversation || cacheGet(`conv_detail_${currentId}`);
        const msgPromise = chatService.getMessages(currentId, { limit: 50 });
        const convPromise = cachedConvData
          ? Promise.resolve({ success: true, conversation: cachedConvData })
          : chatService.getConversationDetail(currentId);

        const [convRes, msgRes] = await Promise.all([convPromise, msgPromise]);

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

          // Acknowledge delivered for incoming unread messages
          const incomingUnread = msgs.filter((m) => m.sender_profile_id !== profile?.profile_id && m.status === 'sent');
          if (incomingUnread.length > 0) {
            wsService.markDelivered(currentId, incomingUnread.map((m) => m.id));
          }
        }
      } catch (err) {
        if (!isCurrent || activeConvIdRef.current !== currentId) return;
        showToast(err.message || 'Failed to load conversation.', 'error');
      } finally {
        if (isCurrent && activeConvIdRef.current === currentId) {
          setIsLoading(false);
          setTimeout(scrollToBottom, 40);
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

        // If message is from other user and we are looking at chat, acknowledge delivery and seen
        if (incomingMsg.sender_profile_id !== profile?.profile_id) {
          wsService.markDelivered(activeConvIdRef.current, [incomingMsg.id]);
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
              status: m.status === 'seen' ? 'seen' : m.status === 'delivered' ? 'delivered' : data.status,
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

    // Listen for messages delivered
    const unsubDelivered = wsService.on('messages_delivered', (data) => {
      if (String(data.conversation_id) === String(activeConvIdRef.current)) {
        const idSet = new Set(data.message_ids);
        setMessages((prev) => {
          let changed = false;
          const updated = prev.map((m) => {
            if (m.id && idSet.has(m.id) && m.status === 'sent') {
              changed = true;
              return { ...m, status: 'delivered' };
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
      audioPlayerManager.stopAll();
      wsService.leaveConversation(currentId);
      unsubStatus();
      unsubMsg();
      unsubAck();
      unsubDelivered();
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
        if (isNearBottomRef.current) setTimeout(() => scrollToBottom('smooth'), 50);
      }
    } catch (e) {
      console.warn('Sync missed messages failed:', e);
    }
  };

  const scrollToBottom = (behavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowScrollBottom(false);
  };

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const fromBottom = scrollHeight - scrollTop - clientHeight;
    isNearBottomRef.current = fromBottom < 100;
    setShowScrollBottom(fromBottom >= 150);

    // If scrolled near top, load older messages
    if (scrollTop < 50 && hasMore && !loadingOlder) {
      loadOlderMessages();
    }
  };

  const loadOlderMessages = async () => {
    const targetId = conversationId;
    if (messages.length === 0 || loadingOlder) return;
    const container = chatContainerRef.current;
    const oldScrollHeight = container ? container.scrollHeight : 0;
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

        // Keep reading position steady without layout jumping
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - oldScrollHeight;
          }
        });
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

    // Optimistic UI message rendered immediately
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
    setTimeout(() => scrollToBottom('smooth'), 40);

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
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.client_message_id === clientMsgId ? { ...m, status: 'failed' } : m
          );
          cacheSet(`conv_msgs_${currentId}`, updated, 60);
          return updated;
        });
        showToast(err.message || 'Failed to send message. Tap Retry.', 'error');
      }
    } else {
      // Timeout fallback: if neither ACK nor delivery arrive within 8s, mark as failed
      setTimeout(() => {
        setMessages((prev) => {
          const target = prev.find((m) => m.client_message_id === clientMsgId);
          if (target && target.status === 'sending') {
            const updated = prev.map((m) =>
              m.client_message_id === clientMsgId ? { ...m, status: 'failed' } : m
            );
            cacheSet(`conv_msgs_${currentId}`, updated, 60);
            return updated;
          }
          return prev;
        });
      }, 8000);
    }
  };

  const handleRetry = async (failedMsg) => {
    if (!failedMsg || !failedMsg.client_message_id) return;
    const currentId = conversationId;

    // Set back to sending state
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.client_message_id === failedMsg.client_message_id ? { ...m, status: 'sending' } : m
      );
      cacheSet(`conv_msgs_${currentId}`, updated, 60);
      return updated;
    });

    const sentWs = wsService.sendMessage(currentId, failedMsg.content, failedMsg.client_message_id);
    if (!sentWs) {
      try {
        const res = await chatService.sendMessage(currentId, failedMsg.content, failedMsg.client_message_id);
        if (res.success && activeConvIdRef.current === currentId) {
          setMessages((prev) => {
            const merged = mergeMessages(prev, [res.message]);
            cacheSet(`conv_msgs_${currentId}`, merged, 60);
            return merged;
          });
        }
      } catch (err) {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.client_message_id === failedMsg.client_message_id ? { ...m, status: 'failed' } : m
          );
          cacheSet(`conv_msgs_${currentId}`, updated, 60);
          return updated;
        });
        showToast('Retry failed. Please check your connection.', 'error');
      }
    }
  };

  const handleSendVoiceMessage = async (audioBlob, durationSec) => {
    const currentId = conversationId;
    const clientMsgId = `cli-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const localBlobUrl = URL.createObjectURL(audioBlob);

    const optimisticVoiceMsg = {
      id: `temp-${Date.now()}`,
      client_message_id: clientMsgId,
      conversation_id: Number(currentId),
      sender_profile_id: profile?.profile_id,
      sender_display_name: profile?.display_name,
      content: '',
      message_type: 'voice',
      audio_url: localBlobUrl,
      duration_seconds: Math.round(durationSec) || 1,
      status: 'sending',
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => {
      const updated = [...prev, optimisticVoiceMsg];
      cacheSet(`conv_msgs_${currentId}`, updated, 60);
      return updated;
    });
    setTimeout(scrollToBottom, 50);

    try {
      const res = await chatService.sendVoiceMessage(currentId, audioBlob, durationSec, clientMsgId);
      if (res.success && activeConvIdRef.current === currentId) {
        setMessages((prev) => {
          const merged = mergeMessages(prev, [res.message]);
          cacheSet(`conv_msgs_${currentId}`, merged, 60);
          return merged;
        });
      }
    } catch (err) {
      showToast(err.message || 'Failed to upload voice message.', 'error');
    }
  };

  const {
    isRecording,
    isLocked,
    isPaused,
    duration: recordDuration,
    audioLevels,
    isCanceling,
    isNearLock,
    pauseRecording,
    resumeRecording,
    stopAndSend,
    cancelRecording,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  } = useVoiceRecorder({
    onSend: handleSendVoiceMessage,
    onError: (msg) => showToast(msg, 'error'),
    maxDuration: 120,
  });

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
    <div className="flex flex-col h-full md:h-[calc(100vh-8rem)] w-full max-w-4xl mx-auto md:rounded-3xl bg-slate-900/90 md:border md:border-slate-800 shadow-2xl overflow-hidden backdrop-blur-xl">
      {/* Chat Header */}
      <div className="px-4 md:px-5 py-3 md:py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-3 sm:gap-4 shrink-0 pt-safe">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 -ml-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-xl overflow-hidden bg-slate-800 border border-slate-700 shrink-0">
            {otherUser?.profile_picture ? (
              <img src={otherUser.profile_picture} alt="" className="w-full h-full object-cover" />
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
              <h3 className="font-bold text-sm text-white truncate max-w-[130px] sm:max-w-[200px]">{otherUser?.display_name || 'Chat'}</h3>
              <span className="font-mono text-[10px] sm:text-xs text-pink-400 font-semibold shrink-0">{otherUser?.profile_id}</span>
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

      {/* Messages Stream */}
      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
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
            const isMe = msg.sender_profile_id === profile?.profile_id;
            return (
              <div
                key={msg.client_message_id || msg.id || index}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[75%] px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm break-words ${
                    isMe
                      ? 'bg-gradient-to-r from-pink-500 to-indigo-600 text-white rounded-br-xs shadow-pink-500/10'
                      : 'bg-slate-800 border border-slate-700/60 text-slate-100 rounded-bl-xs'
                  }`}
                >
                  {msg.message_type === 'voice' ? (
                    <VoiceMessage
                      message={msg}
                      isMe={isMe}
                      formatTime={formatMessageTime}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                  <div
                    className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                      isMe ? 'text-pink-100/70' : 'text-slate-400'
                    }`}
                  >
                    <span>{formatMessageTime(msg.created_at)}</span>
                    {isMe && (
                      <span className="ml-1 inline-flex items-center">
                        {msg.status === 'failed' ? (
                          <button
                            type="button"
                            onClick={() => handleRetry(msg)}
                            className="inline-flex items-center gap-1 text-rose-300 hover:text-white bg-rose-500/20 hover:bg-rose-500/30 px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-colors"
                            title="Sending failed. Click to retry."
                            aria-label="Retry sending message"
                          >
                            <AlertCircle className="w-3 h-3 text-rose-400" />
                            <span className="font-semibold underline">Retry</span>
                          </button>
                        ) : msg.status === 'sending' ? (
                          <Clock className="w-3 h-3 animate-spin text-pink-200/50" title="Sending..." />
                        ) : msg.status === 'seen' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-pink-200 font-bold" title="Seen" />
                        ) : msg.status === 'delivered' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-slate-400/80" title="Delivered" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-pink-200/60" title="Sent" />
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
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-20 right-6 sm:right-8 p-2.5 rounded-full bg-pink-500 hover:bg-pink-600 text-white shadow-xl transition-all flex items-center gap-1.5 text-xs font-semibold cursor-pointer z-10"
        >
          <ChevronDown className="w-4 h-4" />
          <span className="hidden sm:inline">New messages</span>
        </button>
      )}

      {/* Bottom Input Field */}
      {isRecording ? (
        <div className="p-2.5 sm:p-3 md:p-4 bg-slate-950/90 border-t border-slate-800 shrink-0 pb-safe">
          {isLocked ? (
            /* Locked Hands-free Recording Bar */
            <div className="flex items-center justify-between w-full p-2 bg-slate-900/90 rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur-md">
              {/* Left: Delete / Trash */}
              <button
                type="button"
                onClick={cancelRecording}
                className="p-2.5 sm:p-3 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                title="Discard recording"
                aria-label="Discard recording"
              >
                <Trash2 className="w-4 sm:w-5 h-4 sm:h-5" />
              </button>

              {/* Middle: Live Timer + Waveform */}
              <div className="flex items-center gap-1.5 sm:gap-3">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-rose-500 animate-pulse motion-reduce:animate-none'}`} />
                  <span className="font-mono text-xs sm:text-sm font-bold text-white">
                    {formatRecordingTime(recordDuration)}
                  </span>
                </div>

                <div className="flex items-center gap-1 h-5 sm:h-6 px-1 sm:px-2">
                  {audioLevels.map((lvl, idx) => (
                    <div
                      key={idx}
                      style={{ height: `${Math.round(lvl * 100)}%` }}
                      className={`w-0.5 sm:w-1 rounded-full transition-all duration-75 ${
                        isPaused ? 'bg-slate-600' : 'bg-pink-400'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Right: Pause/Resume + Send */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={isPaused ? resumeRecording : pauseRecording}
                  className="p-2.5 sm:p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                  title={isPaused ? 'Resume recording' : 'Pause recording'}
                  aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                >
                  {isPaused ? <Play className="w-4 sm:w-5 h-4 sm:h-5 fill-current" /> : <Pause className="w-4 sm:w-5 h-4 sm:h-5 fill-current" />}
                </button>

                <button
                  type="button"
                  onClick={stopAndSend}
                  className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white shadow-lg shadow-pink-500/20 transition-all cursor-pointer"
                  title="Send voice message"
                  aria-label="Send voice message"
                >
                  <Send className="w-4 sm:w-5 h-4 sm:h-5" />
                </button>
              </div>
            </div>
          ) : (
            /* Hold-to-record Floating Bar */
            <div className="relative flex items-center justify-between w-full p-2 bg-slate-900/95 rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur-md">
              {/* Slide to lock indicator */}
              <div
                className={`absolute -top-12 right-2 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs flex items-center gap-1.5 transition-all shadow-lg ${
                  isNearLock ? 'text-pink-400 scale-105 border-pink-500/50' : 'text-slate-400'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Slide up to lock</span>
              </div>

              {/* Status: Red dot + timer */}
              <div className="flex items-center gap-2 px-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse motion-reduce:animate-none" />
                <span className="font-mono text-xs sm:text-sm font-bold text-white">
                  {formatRecordingTime(recordDuration)}
                </span>
              </div>

              {/* Slide to cancel indicator */}
              <div
                className={`flex items-center gap-1.5 sm:gap-2 transition-all ${
                  isCanceling ? 'text-rose-400 font-semibold scale-105' : 'text-slate-400 text-[11px] sm:text-xs'
                }`}
              >
                <Trash2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                <span>{isCanceling ? 'Release to cancel' : '< Slide to cancel'}</span>
              </div>

              {/* Active Held Mic Indicator */}
              <div
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30 scale-110 animate-pulse motion-reduce:animate-none cursor-pointer shrink-0"
              >
                <Mic className="w-5 h-5" />
              </div>
            </div>
          )}
        </div>
      ) : (
        <form
          onSubmit={handleSendMessage}
          className="p-2.5 sm:p-3 md:p-4 bg-slate-950/90 border-t border-slate-800 flex items-end gap-2 shrink-0 pb-safe"
        >
          <textarea
            rows={1}
            placeholder="Type a message..."
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="flex-grow px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-2xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all resize-none max-h-32 leading-relaxed"
          />

          {inputText.trim() ? (
            <button
              type="submit"
              className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white shadow-lg shadow-pink-500/20 transition-all cursor-pointer shrink-0"
              title="Send message"
              aria-label="Send message"
            >
              <Send className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>
          ) : (
            <button
              type="button"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              className="p-2.5 sm:p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-pink-600 text-slate-300 hover:text-white transition-all cursor-pointer shrink-0 touch-none select-none"
              title="Hold to record, release to send"
              aria-label="Hold to record voice message, release to send"
            >
              <Mic className="w-4 sm:w-5 h-4 sm:h-5" />
            </button>
          )}
        </form>
      )}
    </div>
  );
};

export default Chat;

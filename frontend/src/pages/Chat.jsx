import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { chatService } from '../services/chatService';
import { authService } from '../services/authService';
import { formatRelativeTime } from '../utils/timeUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import { Send, ArrowLeft, User } from 'lucide-react';

export const Chat = () => {
  const { conversationId } = useParams();
  const { username } = useAuth();
  const { showToast } = useToast();

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineStatus, setOnlineStatus] = useState(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);
  const pollingTimerRef = useRef(null);
  const statusTimerRef = useRef(null);
  const typingStatusTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  const fetchOnlineStatus = async (partnerId) => {
    if (!partnerId) return;
    try {
      const res = await authService.getOnlineStatus(partnerId);
      if (res && res.success && res.data) {
        setOnlineStatus(res.data);
      }
    } catch (err) {
      // Ignore background status polling errors
    }
  };

  const fetchChatDetails = async (isPoll = false) => {
    try {
      // Get messages
      const msgResponse = await chatService.getMessages(conversationId);
      if (msgResponse.success && msgResponse.data) {
        // Prevent layout jerk if length is identical
        setMessages((prev) => {
          if (JSON.stringify(prev) !== JSON.stringify(msgResponse.data)) {
            return msgResponse.data;
          }
          return prev;
        });
      }

      // Only fetch conversation details once or on demand
      if (!isPoll) {
        const convoResponse = await chatService.getConversationDetail(conversationId);
        if (convoResponse.success && convoResponse.data) {
          setConversation(convoResponse.data);
        }
      }
    } catch (err) {
      if (!isPoll) {
        showToast('Failed to load chat details.', 'error');
      }
    } finally {
      if (!isPoll) {
        setLoading(false);
      }
    }
  };

  // Scroll to bottom helper
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Initial load & message polling
  useEffect(() => {
    setLoading(true);
    setOnlineStatus(null);
    setIsPartnerTyping(false);
    fetchChatDetails();

    // Start polling every 3 seconds for messages
    pollingTimerRef.current = setInterval(() => {
      fetchChatDetails(true);
    }, 3000);

    return () => {
      if (pollingTimerRef.current) {
        clearInterval(pollingTimerRef.current);
      }
    };
  }, [conversationId]);

  // Online status polling every 15 seconds
  useEffect(() => {
    const partnerId = conversation?.other_participant?.id;
    if (!partnerId) return;

    fetchOnlineStatus(partnerId);

    statusTimerRef.current = setInterval(() => {
      fetchOnlineStatus(partnerId);
    }, 15000);

    return () => {
      if (statusTimerRef.current) {
        clearInterval(statusTimerRef.current);
      }
    };
  }, [conversation?.other_participant?.id]);

  // Typing status polling every 2 seconds
  useEffect(() => {
    if (!conversationId) return;

    const fetchTypingStatus = async () => {
      try {
        const res = await chatService.getTypingStatus(conversationId);
        if (res && res.success && res.data) {
          setIsPartnerTyping(!!res.data.is_typing);
        }
      } catch (err) {
        // Ignore background typing status polling error
      }
    };

    fetchTypingStatus();

    typingStatusTimerRef.current = setInterval(fetchTypingStatus, 2000);

    return () => {
      if (typingStatusTimerRef.current) {
        clearInterval(typingStatusTimerRef.current);
      }
    };
  }, [conversationId]);

  // Scroll to bottom on new messages or typing state change
  useEffect(() => {
    scrollToBottom();
  }, [messages, isPartnerTyping]);

  const handleInputChange = (e) => {
    setNewMessage(e.target.value);

    // Throttled typing signal (at most once every 2.5s while typing)
    const now = Date.now();
    if (now - lastTypingSentRef.current >= 2500) {
      lastTypingSentRef.current = now;
      chatService.sendTypingSignal(conversationId).catch(() => {});
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    const contentToSend = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const response = await chatService.sendMessage(conversationId, contentToSend);
      if (response.success && response.data) {
        // Add to local message list immediately
        setMessages((prev) => [...prev, response.data]);
        scrollToBottom();
      } else {
        showToast('Failed to send message.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const getPartner = () => {
    return conversation?.other_participant || { username: '', full_name: 'Chat Partner' };
  };

  const partner = getPartner();

  if (loading) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col h-[calc(100vh-130px)] md:h-[calc(100vh-150px)] max-w-3xl mx-auto glass-panel rounded-3xl border border-[#F4C0D1] dark:border-brand-purple/10 overflow-hidden bg-white/70 dark:bg-brand-dark/15 transition-colors duration-200">
      {/* Chat Header */}
      <div className="px-5 py-4 border-b border-[#F4C0D1] dark:border-slate-900 flex items-center justify-between bg-white/90 dark:bg-brand-black/45 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            to="/conversations"
            className="p-1.5 rounded-lg text-[#5F5E5A] dark:text-slate-400 hover:text-[#2C2C2A] dark:hover:text-slate-200 hover:bg-[#F4C0D1]/30 dark:hover:bg-slate-800/40 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-[#D4537E]/15 dark:bg-brand-purple/15 flex items-center justify-center border border-[#D4537E]/30 dark:border-brand-purple/25 text-[#D4537E] dark:text-brand-purple-light text-xs font-bold uppercase">
              {partner.username ? partner.username.substring(0, 2) : 'CK'}
            </div>
            {onlineStatus?.is_online && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950" />
            )}
          </div>

          <div className="text-left">
            <h3 className="text-sm font-bold text-[#2C2C2A] dark:text-slate-200">{partner.full_name}</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[#5F5E5A] dark:text-slate-500 font-semibold">@{partner.username}</span>
              {isPartnerTyping ? (
                <div className="flex items-center gap-1 text-[10px] text-[#D4537E] dark:text-brand-purple-light font-semibold">
                  <span className="animate-pulse">typing</span>
                  <span className="flex gap-0.5 items-center">
                    <span className="w-1 h-1 rounded-full bg-[#D4537E] dark:bg-brand-purple-light animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1 h-1 rounded-full bg-[#D4537E] dark:bg-brand-purple-light animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1 h-1 rounded-full bg-[#D4537E] dark:bg-brand-purple-light animate-bounce" />
                  </span>
                </div>
              ) : onlineStatus ? (
                <div className="flex items-center gap-1">
                  {onlineStatus.is_online ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                      <span className="text-[10px] text-emerald-500 dark:text-emerald-400 font-semibold">Online</span>
                    </>
                  ) : onlineStatus.last_seen ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
                      <span className="text-[10px] text-[#5F5E5A] dark:text-slate-400">
                        Last seen {formatRelativeTime(onlineStatus.last_seen)}
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Messages Scroll Zone */}
      <div className="flex-grow overflow-y-auto p-5 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#5F5E5A] dark:text-slate-500 text-center gap-2">
            <User className="w-8 h-8 text-[#5F5E5A] dark:text-slate-600 mb-2" />
            <div className="text-xs font-bold">This is the start of your secure chat history.</div>
            <div className="text-[10px] text-[#5F5E5A] dark:text-slate-600">Send a message to break the ice!</div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_username === username;
            return (
              <div
                key={msg.id}
                className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
                    isMe
                      ? 'bg-[#D4537E] dark:bg-brand-purple text-white rounded-br-none border border-[#D4537E]/20 dark:border-brand-purple-light/20 shadow-md'
                      : 'bg-white dark:bg-brand-black/60 text-[#2C2C2A] dark:text-slate-200 rounded-bl-none border border-[#F4C0D1] dark:border-slate-800 shadow-xs'
                  }`}
                >
                  <p className="leading-relaxed break-words text-left">{msg.content}</p>
                  <div
                    className={`text-[8px] font-semibold mt-1 text-left ${
                      isMe ? 'text-pink-100 dark:text-purple-300' : 'text-[#5F5E5A] dark:text-slate-500'
                    }`}
                  >
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* WhatsApp-style typing indicator bubble in message area */}
        {isPartnerTyping && (
          <div className="flex w-full justify-start animate-fade-in">
            <div className="bg-white dark:bg-brand-black/60 text-[#5F5E5A] dark:text-slate-400 px-4 py-2 rounded-2xl rounded-bl-none border border-[#F4C0D1] dark:border-slate-800 flex items-center gap-2 text-xs shadow-xs">
              <span className="text-[#D4537E] dark:text-brand-purple-light font-medium text-[11px]">{partner.full_name || partner.username} is typing</span>
              <span className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4537E] dark:bg-brand-purple-light animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4537E] dark:bg-brand-purple-light animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-[#D4537E] dark:bg-brand-purple-light animate-bounce" />
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Form */}
      <form
        onSubmit={handleSend}
        className="p-4 border-t border-[#F4C0D1] dark:border-slate-900 flex gap-3 bg-white/90 dark:bg-brand-black/35 backdrop-blur-md"
      >
        <input
          type="text"
          className="flex-grow glass-input px-4 py-3 rounded-xl text-sm"
          placeholder="Type your message..."
          value={newMessage}
          onChange={handleInputChange}
          disabled={sending}
          required
        />
        <button
          type="submit"
          className="p-3 bg-[#D4537E] hover:bg-[#c2436d] dark:bg-brand-purple dark:hover:bg-brand-purple-dark text-white rounded-xl border border-transparent dark:border-brand-purple-light/20 transition-all duration-200 flex items-center justify-center flex-shrink-0 cursor-pointer shadow-md shadow-[#D4537E]/10 dark:shadow-brand-purple/10 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={sending || !newMessage.trim()}
        >
          <Send className="w-4.5 h-4.5" />
        </button>
      </form>
    </div>
  );
};

export default Chat;


import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Send, Check, CheckCheck, Clock,
  ChevronDown, WifiOff, AlertCircle, Mic, Lock, Trash2, Pause, Play, RefreshCw,
  MoreVertical, Copy, Edit2, Ban, X, Image as ImageIcon, Camera, Reply, CornerUpLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { chatService } from '../services/chatService';
import { wsService } from '../services/websocketService';
import { cacheGet, cacheSet } from '../utils/cache';
import { mergeMessages } from '../utils/messageUtils';
import { audioPlayerManager } from '../utils/audioPlayerManager';
import VoiceMessage from '../components/VoiceMessage';
import ChatImageMessage from '../components/ChatImageMessage';
import ImageViewerModal from '../components/ImageViewerModal';
import CameraCaptureModal from '../components/CameraCaptureModal';
import { SwipeableMessageItem } from '../components/SwipeableMessageItem';
import useVoiceRecorder from '../hooks/useVoiceRecorder';
import Loader from '../components/Loader';
import Modal from '../components/Modal';
import { getOptimizedImageUrl } from '../utils/imageUtils';
import { getAuthenticatedMediaUrl } from '../utils/mediaUrl';

const AuthenticatedReplyThumbnail = ({ rawUrl }) => {
  const [src, setSrc] = useState(() =>
    rawUrl && (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) ? rawUrl : null
  );

  useEffect(() => {
    let active = true;
    if (!rawUrl) {
      setSrc(null);
      return;
    }
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
      setSrc(rawUrl);
      return;
    }
    getAuthenticatedMediaUrl(rawUrl)
      .then((resolved) => {
        if (active && resolved) setSrc(resolved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [rawUrl]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt="Preview"
      className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-700"
    />
  );
};

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

  // Message Action Menu & Edit / Delete states
  const [activeMenuMessage, setActiveMenuMessage] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingMessage, setDeletingMessage] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const messageInputRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });

  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const otherTypingTimeoutRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const activeConvIdRef = useRef(conversationId);
  activeConvIdRef.current = conversationId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // 1. Load initial conversation details and message history
  useEffect(() => {
    let isCurrent = true;
    const currentId = conversationId;

    // Immediately synchronize view with passed conversation state or cache
    const passedConv = location.state?.conversation;
    const cachedConv = passedConv || cacheGet(`conv_detail_${currentId}`);
    const cachedMsgs = cacheGet(`conv_msgs_${currentId}`);
    if (cachedConv) {
      setConversation(cachedConv);
      cacheSet(`conv_detail_${currentId}`, cachedConv, 120);
    } else {
      setConversation(null);
    }

    const initialMessages = cachedMsgs || (passedConv?.last_message ? [passedConv.last_message] : []);
    setMessages(initialMessages);
    setIsLoading(!cachedMsgs && !passedConv?.last_message);
    setOtherUserTyping(false);
    setInputText('');
    setReplyingTo(null);

    // Join conversation room via WebSocket
    wsService.joinConversation(currentId);

    const loadInitialData = async () => {
      try {
        const cachedConvData = location.state?.conversation || cacheGet(`conv_detail_${currentId}`);
        const cachedMsgs = cacheGet(`conv_msgs_${currentId}`);

        // If we have cached messages, perform a fast delta sync (since_id) rather than full 50-message refetch
        let msgPromise;
        if (cachedMsgs && cachedMsgs.length > 0) {
          const realMsgs = cachedMsgs.filter((m) => m.id && !String(m.id).startsWith('temp-'));
          const latestId = realMsgs.length > 0 ? Math.max(...realMsgs.map((m) => Number(m.id))) : null;
          if (latestId && isFinite(latestId)) {
            msgPromise = chatService.getMessages(currentId, { since_id: latestId });
          } else {
            msgPromise = chatService.getMessages(currentId, { limit: 50 });
          }
        } else {
          msgPromise = chatService.getMessages(currentId, { limit: 50 });
        }

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
          if (msgs.length > 0) {
            setMessages((prev) => {
              if (!isCurrent || activeConvIdRef.current !== currentId) return prev;
              const merged = mergeMessages(prev, msgs);
              cacheSet(`conv_msgs_${currentId}`, merged, 60);
              return merged;
            });

            // Acknowledge delivered for incoming unread messages
            const incomingUnread = msgs.filter((m) => m.sender_profile_id !== profile?.profile_id && m.status === 'sent');
            if (incomingUnread.length > 0) {
              wsService.markDelivered(currentId, incomingUnread.map((m) => m.id));
            }
          }
          if (msgRes.has_more !== undefined) {
            setHasMore(msgRes.has_more);
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

    // Listen for conversation updates (backup / push channel)
    const unsubConvUpdate = wsService.on('conversation_update', (data) => {
      const incomingMsg = data.message;
      if (incomingMsg && String(data.conversation_id) === String(activeConvIdRef.current)) {
        const alreadyKnown = messagesRef.current.some(
          (m) =>
            (incomingMsg.id && m.id === incomingMsg.id) ||
            (incomingMsg.client_message_id && m.client_message_id === incomingMsg.client_message_id)
        );
        if (alreadyKnown) {
          return;
        }

        setMessages((prev) => {
          const merged = mergeMessages(prev, [incomingMsg]);
          cacheSet(`conv_msgs_${activeConvIdRef.current}`, merged, 60);
          return merged;
        });

        if (incomingMsg.sender_profile_id !== profile?.profile_id) {
          wsService.markDelivered(activeConvIdRef.current, [incomingMsg.id]);
          wsService.markSeen(activeConvIdRef.current);
        }

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

    // Listen for message edited
    const unsubEdit = wsService.on('message_edited', (data) => {
      const editedMsg = data.message;
      if (String(editedMsg.conversation_id) === String(activeConvIdRef.current)) {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.id === editedMsg.id || (m.client_message_id && m.client_message_id === editedMsg.client_message_id)
              ? { ...m, content: editedMsg.content, is_edited: true }
              : m
          );
          cacheSet(`conv_msgs_${activeConvIdRef.current}`, updated, 60);
          return updated;
        });
      }
    });

    // Listen for message deleted
    const unsubDelete = wsService.on('message_deleted', (data) => {
      if (String(data.conversation_id) === String(activeConvIdRef.current)) {
        if (data.delete_type === 'everyone') {
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === data.message_id
                ? { ...m, is_deleted: true, content: '', audio_url: null }
                : m
            );
            cacheSet(`conv_msgs_${activeConvIdRef.current}`, updated, 60);
            return updated;
          });
        }
      }
    });

    return () => {
      isCurrent = false;
      audioPlayerManager.stopAll();
      wsService.leaveConversation(currentId);
      unsubStatus();
      unsubMsg();
      unsubConvUpdate();
      unsubAck();
      unsubDelivered();
      unsubTyping();
      unsubSeen();
      unsubPresence();
      unsubEdit();
      unsubDelete();
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
    };
  }, [conversationId]);

  // Sync missed messages (reads messagesRef to avoid stale closures on WS reconnect)
  const syncMissedMessages = async (targetId = activeConvIdRef.current) => {
    const currentMsgs = messagesRef.current || [];
    if (currentMsgs.length === 0) return;
    const realMsgs = currentMsgs.filter((m) => m.id && !String(m.id).startsWith('temp-'));
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

  // Close menu on click outside, scroll, Escape
  useEffect(() => {
    const handleCloseMenu = () => {
      setActiveMenuMessage(null);
      setMenuPosition(null);
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleCloseMenu();
        if (editingMessageId) setEditingMessageId(null);
      }
    };

    window.addEventListener('click', handleCloseMenu);
    window.addEventListener('scroll', handleCloseMenu, true);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', handleCloseMenu);
      window.removeEventListener('scroll', handleCloseMenu, true);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editingMessageId]);

  const handleTouchStart = (msg, e) => {
    if (msg.is_deleted) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    longPressTimerRef.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(40);
      setActiveMenuMessage(msg);
      setMenuPosition({
        x: Math.max(10, Math.min(touch.clientX - 60, window.innerWidth - 160)),
        y: Math.max(10, Math.min(touch.clientY - 40, window.innerHeight - 200)),
      });
    }, 450);
  };

  const handleTouchMove = (e) => {
    if (!longPressTimerRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleContextMenu = (msg, e) => {
    if (msg.is_deleted) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveMenuMessage(msg);
    setMenuPosition({
      x: Math.max(10, Math.min(e.clientX, window.innerWidth - 160)),
      y: Math.max(10, Math.min(e.clientY, window.innerHeight - 200)),
    });
  };

  const handleThreeDotClick = (msg, e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveMenuMessage(msg);
    setMenuPosition({
      x: Math.max(10, Math.min(rect.left - 50, window.innerWidth - 160)),
      y: Math.max(10, Math.min(rect.bottom + 4, window.innerHeight - 200)),
    });
  };

  const handleStartReply = (msg) => {
    if (!msg || msg.is_deleted) return;
    setActiveMenuMessage(null);
    setReplyingTo(msg);
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 50);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleJumpToMessage = async (targetId) => {
    if (!targetId) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('reply-highlight');
      void el.offsetWidth;
      el.classList.add('reply-highlight');
      setTimeout(() => {
        el.classList.remove('reply-highlight');
      }, 1600);
      return;
    }

    // Target not in DOM: fetch messages around targetId
    try {
      const res = await chatService.getMessages(conversationId, { around_id: targetId, limit: 30 });
      if (res.success && res.messages?.length > 0 && activeConvIdRef.current === conversationId) {
        setMessages((prev) => {
          if (activeConvIdRef.current !== conversationId) return prev;
          const merged = mergeMessages(prev, res.messages);
          cacheSet(`conv_msgs_${conversationId}`, merged, 60);
          return merged;
        });
        setTimeout(() => {
          const targetEl = document.getElementById(`msg-${targetId}`);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetEl.classList.remove('reply-highlight');
            void targetEl.offsetWidth;
            targetEl.classList.add('reply-highlight');
            setTimeout(() => {
              targetEl.classList.remove('reply-highlight');
            }, 1600);
          } else {
            showToast('Original message could not be found.', 'info');
          }
        }, 100);
      } else {
        showToast('Original message could not be loaded.', 'info');
      }
    } catch (err) {
      showToast('Failed to load replied message.', 'error');
    }
  };

  const handleCopyMessage = (msg) => {
    if (msg.content) {
      navigator.clipboard.writeText(msg.content);
      showToast('Copied to clipboard', 'success');
    }
    setActiveMenuMessage(null);
  };

  const handleStartEdit = (msg) => {
    if (msg.is_deleted || msg.message_type !== 'text') return;
    setEditingMessageId(msg.id);
    setEditingText(msg.content);
    setActiveMenuMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleSaveEdit = async (msgId) => {
    const trimmed = editingText.trim();
    if (!trimmed) {
      showToast('Message cannot be empty', 'error');
      return;
    }

    const originalMsg = messages.find((m) => m.id === msgId);
    const prevContent = originalMsg?.content;

    // Optimistic update
    setMessages((prev) => {
      const updated = prev.map((m) => (m.id === msgId ? { ...m, content: trimmed, is_edited: true } : m));
      cacheSet(`conv_msgs_${activeConvIdRef.current}`, updated, 60);
      return updated;
    });
    setEditingMessageId(null);
    setEditingText('');

    try {
      const res = await chatService.editMessage(conversationId, msgId, trimmed);
      if (!res.success) {
        setMessages((prev) => {
          const reverted = prev.map((m) => (m.id === msgId ? { ...m, content: prevContent, is_edited: originalMsg?.is_edited } : m));
          cacheSet(`conv_msgs_${activeConvIdRef.current}`, reverted, 60);
          return reverted;
        });
        showToast(res.message || 'Failed to edit message', 'error');
      }
    } catch (err) {
      setMessages((prev) => {
        const reverted = prev.map((m) => (m.id === msgId ? { ...m, content: prevContent, is_edited: originalMsg?.is_edited } : m));
        cacheSet(`conv_msgs_${activeConvIdRef.current}`, reverted, 60);
        return reverted;
      });
      showToast(err.message || 'Failed to edit message', 'error');
    }
  };

  const handlePromptDelete = (msg) => {
    setDeletingMessage(msg);
    setActiveMenuMessage(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (type) => {
    if (!deletingMessage) return;
    const msgId = deletingMessage.id;
    const originalMsg = deletingMessage;

    setIsDeleting(true);

    if (type === 'me') {
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== msgId);
        cacheSet(`conv_msgs_${activeConvIdRef.current}`, filtered, 60);
        return filtered;
      });
    } else {
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === msgId ? { ...m, is_deleted: true, content: '', audio_url: null } : m
        );
        cacheSet(`conv_msgs_${activeConvIdRef.current}`, updated, 60);
        return updated;
      });
    }

    setIsDeleteModalOpen(false);
    setDeletingMessage(null);

    try {
      const res = await chatService.deleteMessage(conversationId, msgId, type);
      if (!res.success) {
        setMessages((prev) => {
          const reverted = mergeMessages(prev, [originalMsg]);
          cacheSet(`conv_msgs_${activeConvIdRef.current}`, reverted, 60);
          return reverted;
        });
        showToast(res.message || 'Failed to delete message', 'error');
      }
    } catch (err) {
      setMessages((prev) => {
        const reverted = mergeMessages(prev, [originalMsg]);
        cacheSet(`conv_msgs_${activeConvIdRef.current}`, reverted, 60);
        return reverted;
      });
      showToast(err.message || 'Failed to delete message', 'error');
    } finally {
      setIsDeleting(false);
    }
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
    const replyTarget = replyingTo;
    const replyToId = replyTarget?.id && !String(replyTarget.id).startsWith('temp-') ? replyTarget.id : null;
    const optimisticReplyDetails = replyTarget ? {
      id: replyTarget.id,
      sender_profile_id: replyTarget.sender_profile_id,
      sender_display_name: replyTarget.sender_display_name,
      content: replyTarget.content,
      message_type: replyTarget.message_type,
      duration_seconds: replyTarget.duration_seconds,
      thumbnail_url: replyTarget.thumbnail_url || replyTarget.image_url || replyTarget.local_preview_url,
      is_deleted: !!replyTarget.is_deleted,
    } : null;

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
      reply_to_id: replyToId,
      reply_to_details: optimisticReplyDetails,
    };

    setMessages((prev) => {
      const updated = [...prev, optimisticMsg];
      cacheSet(`conv_msgs_${currentId}`, updated, 60);
      return updated;
    });
    setInputText('');
    setReplyingTo(null);
    setIsTyping(false);
    wsService.sendTyping(currentId, false);
    setTimeout(() => scrollToBottom('smooth'), 40);

    // Attempt sending via WebSocket
    const sentWs = wsService.sendMessage(currentId, text, clientMsgId, replyToId);
    if (!sentWs) {
      // Fallback to REST API
      try {
        const res = await chatService.sendMessage(currentId, text, clientMsgId, replyToId);
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

    if (failedMsg.message_type === 'voice') {
      try {
        if (failedMsg.audio_url && failedMsg.audio_url.startsWith('blob:')) {
          const resp = await fetch(failedMsg.audio_url);
          const blob = await resp.blob();
          const res = await chatService.sendVoiceMessage(currentId, blob, failedMsg.duration_seconds, failedMsg.client_message_id);
          if (res.success && activeConvIdRef.current === currentId) {
            setMessages((prev) => {
              const merged = mergeMessages(prev, [res.message]);
              cacheSet(`conv_msgs_${currentId}`, merged, 60);
              return merged;
            });
            return;
          }
        }
      } catch (err) {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.client_message_id === failedMsg.client_message_id ? { ...m, status: 'failed' } : m
          );
          cacheSet(`conv_msgs_${currentId}`, updated, 60);
          return updated;
        });
        showToast('Voice retry failed. Please record again.', 'error');
        return;
      }
    }

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
    const replyTarget = replyingTo;
    const replyToId = replyTarget?.id && !String(replyTarget.id).startsWith('temp-') ? replyTarget.id : null;
    const optimisticReplyDetails = replyTarget ? {
      id: replyTarget.id,
      sender_profile_id: replyTarget.sender_profile_id,
      sender_display_name: replyTarget.sender_display_name,
      content: replyTarget.content,
      message_type: replyTarget.message_type,
      duration_seconds: replyTarget.duration_seconds,
      thumbnail_url: replyTarget.thumbnail_url || replyTarget.image_url || replyTarget.local_preview_url,
      is_deleted: !!replyTarget.is_deleted,
    } : null;

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
      reply_to_id: replyToId,
      reply_to_details: optimisticReplyDetails,
    };

    setMessages((prev) => {
      const updated = [...prev, optimisticVoiceMsg];
      cacheSet(`conv_msgs_${currentId}`, updated, 60);
      return updated;
    });
    setReplyingTo(null);
    setTimeout(() => scrollToBottom('smooth'), 50);

    try {
      const res = await chatService.sendVoiceMessage(currentId, audioBlob, durationSec, clientMsgId, replyToId);
      if (res.success && activeConvIdRef.current === currentId) {
        setMessages((prev) => {
          const merged = mergeMessages(prev, [res.message]);
          cacheSet(`conv_msgs_${currentId}`, merged, 60);
          return merged;
        });
        // Safely revoke optimistic blob URL after server URL replaces it
        setTimeout(() => {
          try { URL.revokeObjectURL(localBlobUrl); } catch (_) {}
        }, 1500);
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.client_message_id === clientMsgId ? { ...m, status: 'failed' } : m
        );
        cacheSet(`conv_msgs_${currentId}`, updated, 60);
        return updated;
      });
      showToast(err.message || 'Failed to upload voice message. Tap Retry.', 'error');
    }
  };

  const [viewerMessage, setViewerMessage] = useState(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const imageInputRef = useRef(null);
  const attachMenuRef = useRef(null);
  const pendingImageFilesRef = useRef(new Map());

  // Click-outside listener for photo attachment menu
  useEffect(() => {
    if (!isAttachMenuOpen) return;
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setIsAttachMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isAttachMenuOpen]);

  const sendImageFile = async (file, existingClientMsgId = null) => {
    const currentId = activeConvIdRef.current;
    if (!currentId || !file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image exceeds 10MB limit.', 'error');
      return;
    }

    const clientMsgId = existingClientMsgId || `img-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    pendingImageFilesRef.current.set(clientMsgId, file);

    const replyTarget = replyingTo;
    const replyToId = replyTarget?.id && !String(replyTarget.id).startsWith('temp-') ? replyTarget.id : null;
    const optimisticReplyDetails = replyTarget ? {
      id: replyTarget.id,
      sender_profile_id: replyTarget.sender_profile_id,
      sender_display_name: replyTarget.sender_display_name,
      content: replyTarget.content,
      message_type: replyTarget.message_type,
      duration_seconds: replyTarget.duration_seconds,
      thumbnail_url: replyTarget.thumbnail_url || replyTarget.image_url || replyTarget.local_preview_url,
      is_deleted: !!replyTarget.is_deleted,
    } : null;

    const localPreviewUrl = URL.createObjectURL(file);

    let imgWidth = 400;
    let imgHeight = 300;
    try {
      if (window.createImageBitmap) {
        const bmp = await createImageBitmap(file);
        imgWidth = bmp.width;
        imgHeight = bmp.height;
        bmp.close();
      }
    } catch {
      // fallback
    }

    const optimisticImgMsg = {
      id: clientMsgId,
      client_message_id: clientMsgId,
      conversation_id: currentId,
      sender_profile_id: profile?.profile_id,
      sender_display_name: profile?.display_name,
      message_type: 'image',
      image_width: imgWidth,
      image_height: imgHeight,
      local_preview_url: localPreviewUrl,
      status: 'sending',
      created_at: new Date().toISOString(),
      reply_to_id: replyToId,
      reply_to_details: optimisticReplyDetails,
    };

    setMessages((prev) => {
      const filtered = prev.filter((m) => m.client_message_id !== clientMsgId);
      const updated = [...filtered, optimisticImgMsg];
      cacheSet(`conv_msgs_${currentId}`, updated, 60);
      return updated;
    });
    setReplyingTo(null);
    setTimeout(() => scrollToBottom('smooth'), 50);

    try {
      const res = await chatService.sendImageMessage(currentId, file, clientMsgId, null, replyToId);
      if (res.success && activeConvIdRef.current === currentId) {
        pendingImageFilesRef.current.delete(clientMsgId);
        setMessages((prev) => {
          const merged = mergeMessages(prev, [res.message]);
          cacheSet(`conv_msgs_${currentId}`, merged, 60);
          return merged;
        });
        setTimeout(() => {
          try { URL.revokeObjectURL(localPreviewUrl); } catch (_) {}
        }, 1500);
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.client_message_id === clientMsgId ? { ...m, status: 'failed' } : m
        );
        cacheSet(`conv_msgs_${currentId}`, updated, 60);
        return updated;
      });
      showToast(err.message || 'Failed to upload photo. Tap to retry.', 'error');
    }
  };

  const handleImageInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const f of files) {
      sendImageFile(f);
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const handleRetryImage = (msg) => {
    const file = pendingImageFilesRef.current.get(msg.client_message_id);
    if (file) {
      sendImageFile(file, msg.client_message_id);
    } else {
      showToast('Please re-select the photo to retry.', 'info');
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
    previewUrl,
    isPlayingPreview,
    pauseRecording,
    resumeRecording,
    togglePreview,
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
            const isEditing = editingMessageId === msg.id;
            return (
              <SwipeableMessageItem
                key={msg.client_message_id || msg.id || index}
                message={msg}
                isMe={isMe}
                isEditing={isEditing}
                editingText={editingText}
                setEditingText={setEditingText}
                handleSaveEdit={handleSaveEdit}
                handleCancelEdit={handleCancelEdit}
                handleRetry={handleRetry}
                handleRetryImage={handleRetryImage}
                setViewerMessage={setViewerMessage}
                formatMessageTime={formatMessageTime}
                onThreeDotClick={handleThreeDotClick}
                onReply={handleStartReply}
                onJumpToReply={handleJumpToMessage}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onContextMenu={handleContextMenu}
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

      {/* Bottom Composer Area with Docked Reply Preview */}
      <div className="shrink-0 border-t border-slate-800 bg-slate-950/90 pb-safe">
        {replyingTo && (
          <div className="px-3 sm:px-4 py-2 bg-slate-900/95 border-b border-slate-800/80 flex items-center justify-between gap-3 text-xs animate-in fade-in slide-in-from-bottom-2 duration-150 backdrop-blur-md">
            <div className="flex items-center gap-2.5 min-w-0 flex-grow">
              <div className="w-1 self-stretch rounded-full bg-gradient-to-b from-pink-500 to-indigo-500 shrink-0" />
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-1.5">
                  <CornerUpLeft className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  <span className="font-semibold text-pink-400 truncate text-[11px] sm:text-xs">
                    Replying to {replyingTo.sender_profile_id === profile?.profile_id ? 'yourself' : (replyingTo.sender_display_name || replyingTo.sender_profile_id || 'User')}
                  </span>
                </div>
                <div className="text-slate-300 text-[11px] truncate mt-0.5">
                  {replyingTo.is_deleted ? (
                    <span className="italic text-slate-500">This message was deleted</span>
                  ) : (
                    replyingTo.content ||
                    (replyingTo.message_type === 'image'
                      ? '📷 Photo'
                      : replyingTo.message_type === 'voice'
                      ? `🎤 Voice message ${replyingTo.duration_seconds ? `(${replyingTo.duration_seconds}s)` : ''}`
                      : 'Message')
                  )}
                </div>
              </div>
              {(replyingTo.thumbnail_url || replyingTo.image_url || replyingTo.local_preview_url) && !replyingTo.is_deleted && (
                <AuthenticatedReplyThumbnail
                  rawUrl={replyingTo.thumbnail_url || replyingTo.image_url || replyingTo.local_preview_url}
                />
              )}
            </div>
            <button
              type="button"
              onClick={handleCancelReply}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              title="Cancel reply"
              aria-label="Cancel reply"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isRecording ? (
          <div className="p-2.5 sm:p-3 md:p-4">
            {isLocked ? (
              /* Locked Hands-free Recording Bar */
              <div className="flex items-center justify-between w-full p-2 bg-slate-900/90 rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur-md">
                {/* Left: Delete / Trash */}
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="p-2.5 sm:p-3 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                  title="Discard recording"
                  aria-label="Discard recording"
                >
                  <Trash2 className="w-4 sm:w-5 h-4 sm:h-5" />
                </button>

                {/* Middle: Live Timer + Waveform */}
                <div className="flex items-center gap-1.5 sm:gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-rose-500 animate-pulse motion-reduce:animate-none'}`} />
                    <span className="font-mono text-xs sm:text-sm font-bold text-white min-w-[32px] sm:min-w-[38px]">
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

                {/* Right: Preview / Resume / Pause + Send */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {isPaused && (
                    <button
                      type="button"
                      onClick={togglePreview}
                      className={`p-2.5 sm:p-3 rounded-xl transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center ${
                        isPlayingPreview ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                      title={isPlayingPreview ? 'Pause preview' : 'Listen to recording'}
                      aria-label={isPlayingPreview ? 'Pause preview' : 'Listen to recording'}
                    >
                      {isPlayingPreview ? <Pause className="w-4 sm:w-5 h-4 sm:h-5 fill-current" /> : <Play className="w-4 sm:w-5 h-4 sm:h-5 fill-current" />}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={isPaused ? resumeRecording : pauseRecording}
                    className="p-2.5 sm:p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title={isPaused ? 'Resume recording' : 'Pause recording'}
                    aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                  >
                    {isPaused ? <Mic className="w-4 sm:w-5 h-4 sm:h-5 text-pink-400" /> : <Pause className="w-4 sm:w-5 h-4 sm:h-5 fill-current" />}
                  </button>

                  <button
                    type="button"
                    onClick={stopAndSend}
                    className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 active:scale-95 text-white shadow-lg shadow-pink-500/20 transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
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

                {/* Active Mic + Direct Send Button */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onClick={stopAndSend}
                    className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-600 text-white shadow-lg shadow-rose-500/30 scale-105 animate-pulse motion-reduce:animate-none cursor-pointer shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                    title="Release or tap to send"
                  >
                    <Mic className="w-5 h-5" />
                  </div>

                  <button
                    type="button"
                    onClick={stopAndSend}
                    className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 text-white shadow-lg shadow-pink-500/20 transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                    title="Send voice message"
                    aria-label="Send voice message"
                  >
                    <Send className="w-4 sm:w-5 h-4 sm:h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleSendMessage}
            className="p-2.5 sm:p-3 md:p-4 flex items-end gap-2"
          >
            {/* Photo Attachment Menu Trigger & Popover */}
            <div className="relative shrink-0" ref={attachMenuRef}>
              <button
                type="button"
                onClick={() => setIsAttachMenuOpen((prev) => !prev)}
                className={`p-2.5 sm:p-3 rounded-2xl border transition-all cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center ${
                  isAttachMenuOpen
                    ? 'bg-pink-500/20 border-pink-500/60 text-pink-400'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 hover:border-pink-500/40 text-slate-400 hover:text-pink-400'
                }`}
                title="Attach media"
                aria-label="Attach media"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              {/* Attachment Options Popover */}
              {isAttachMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-52 p-1.5 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-md z-30 flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      imageInputRef.current?.click();
                    }}
                    className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800/80 text-slate-200 hover:text-white flex items-center gap-2.5 text-xs font-semibold transition-colors cursor-pointer text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <span>Choose from Gallery</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      setIsCameraModalOpen(true);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl hover:bg-slate-800/80 text-slate-200 hover:text-white flex items-center gap-2.5 text-xs font-semibold transition-colors cursor-pointer text-left"
                  >
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                      <Camera className="w-4 h-4" />
                    </div>
                    <span>Take Photo</span>
                  </button>
                </div>
              )}
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              onChange={handleImageInputChange}
              className="hidden"
            />

            <textarea
              ref={messageInputRef}
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
                className="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white shadow-lg shadow-pink-500/20 transition-all cursor-pointer shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Send message"
                aria-label="Send message"
              >
                <Send className="w-4 sm:w-5 h-4 sm:h-5" />
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={handlePointerDown}
                className="p-2.5 sm:p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-pink-600 text-slate-300 hover:text-white transition-all cursor-pointer shrink-0 touch-none select-none min-w-[44px] min-h-[44px] flex items-center justify-center"
                title="Tap to record hands-free, hold to speak"
                aria-label="Record voice message"
              >
                <Mic className="w-4 sm:w-5 h-4 sm:h-5" />
              </button>
            )}
          </form>
        )}
      </div>

      {/* Floating Action Menu */}
      {activeMenuMessage && menuPosition && (
        <div
          style={{ top: `${menuPosition.y}px`, left: `${menuPosition.x}px` }}
          className="fixed z-50 min-w-[150px] bg-slate-900/95 border border-slate-700/80 rounded-xl shadow-2xl py-1 text-xs text-slate-200 backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {!activeMenuMessage.is_deleted && (
            <button
              type="button"
              onClick={() => handleStartReply(activeMenuMessage)}
              className="w-full px-3.5 py-2 text-left hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <Reply className="w-3.5 h-3.5 text-pink-400" />
              <span>Reply</span>
            </button>
          )}

          {activeMenuMessage.message_type === 'text' && activeMenuMessage.content && (
            <button
              type="button"
              onClick={() => handleCopyMessage(activeMenuMessage)}
              className="w-full px-3.5 py-2 text-left hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy</span>
            </button>
          )}

          {activeMenuMessage.sender_profile_id === profile?.profile_id &&
            activeMenuMessage.message_type === 'text' &&
            !activeMenuMessage.is_deleted && (
              <button
                type="button"
                onClick={() => handleStartEdit(activeMenuMessage)}
                className="w-full px-3.5 py-2 text-left hover:bg-slate-800 flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-pink-400" />
                <span>Edit</span>
              </button>
            )}

          {!activeMenuMessage.is_deleted && (
            <button
              type="button"
              onClick={() => handlePromptDelete(activeMenuMessage)}
              className="w-full px-3.5 py-2 text-left hover:bg-rose-500/10 text-rose-400 flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete...</span>
            </button>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsDeleteModalOpen(false);
            setDeletingMessage(null);
          }
        }}
        title="Delete Message"
      >
        {deletingMessage && (
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              {deletingMessage.sender_profile_id === profile?.profile_id
                ? 'Are you sure you want to delete this message? You can delete it just for yourself or for everyone in this chat.'
                : 'Are you sure you want to delete this message for yourself? Other participants will still be able to see it.'}
            </p>

            <div className="flex flex-col gap-2 pt-2">
              {deletingMessage.sender_profile_id === profile?.profile_id && (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => handleConfirmDelete('everyone')}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-rose-600/20 disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Deleting...' : 'Delete for Everyone'}</span>
                </button>
              )}

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleConfirmDelete('me')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-[0.99] text-slate-200 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <span>{isDeleting ? 'Deleting...' : 'Delete for Me'}</span>
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeletingMessage(null);
                }}
                className="w-full py-2 px-4 rounded-xl text-slate-400 hover:text-white font-medium text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Lightbox Fullscreen Image Viewer */}
      {viewerMessage && (
        <ImageViewerModal
          message={viewerMessage}
          onClose={() => setViewerMessage(null)}
        />
      )}

      {/* Live Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={(capturedFile) => sendImageFile(capturedFile)}
      />
    </div>
  );
};

export default Chat;

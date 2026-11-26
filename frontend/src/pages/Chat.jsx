import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Trash2, Copy, Edit2, Reply } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { chatService } from '../services/chatService';
import { wsService } from '../services/websocketService';
import { cacheGet, cacheSet } from '../utils/cache';
import { mergeMessages } from '../utils/messageUtils';
import { audioPlayerManager } from '../utils/audioPlayerManager';
import { compressImageFile } from '../utils/imageUtils';
import ImageViewerModal from '../components/ImageViewerModal';
import Modal from '../components/Modal';
import { ChatHeader } from '../components/chat/ChatHeader';
import { MessageList } from '../components/chat/MessageList';
import { ScrollToBottomButton } from '../components/chat/ScrollToBottomButton';
import { MessageComposer } from '../components/chat/MessageComposer';

const formatMessageTime = (isoString) => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

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
  const [isLoading, setIsLoading] = useState(() => {
    const cached = cacheGet(`conv_msgs_${conversationId}`);
    return !cached || cached.length === 0;
  });
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
  const [viewerMessage, setViewerMessage] = useState(null);

  const messageInputRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const otherTypingTimeoutRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const pendingImageFilesRef = useRef(new Map());

  // Refs for stable callbacks (prevents MessageList / SwipeableMessageItem re-renders)
  const activeConvIdRef = useRef(conversationId);
  activeConvIdRef.current = conversationId;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const replyingToRef = useRef(replyingTo);
  replyingToRef.current = replyingTo;
  const editingTextRef = useRef(editingText);
  editingTextRef.current = editingText;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingOlderRef = useRef(loadingOlder);
  loadingOlderRef.current = loadingOlder;

  const scrollToBottom = useCallback((behavior = 'auto') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
    setShowScrollBottom(false);
  }, []);

  // Sync missed messages (reads messagesRef to avoid stale closures on WS reconnect)
  const syncMissedMessages = useCallback(async (targetId = activeConvIdRef.current) => {
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
  }, [scrollToBottom]);

  // 1. Load initial conversation details and message history
  useEffect(() => {
    let isCurrent = true;
    const currentId = conversationId;

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
    setReplyingTo(null);

    wsService.joinConversation(currentId);

    const loadInitialData = async () => {
      try {
        const cachedConvData = location.state?.conversation || cacheGet(`conv_detail_${currentId}`);
        const latestCachedMsgs = cacheGet(`conv_msgs_${currentId}`);

        let msgPromise;
        if (latestCachedMsgs && latestCachedMsgs.length > 0) {
          const realMsgs = latestCachedMsgs.filter((m) => m.id && !String(m.id).startsWith('temp-'));
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

            const incomingUnread = msgs.filter(
              (m) => m.sender_profile_id !== profileRef.current?.profile_id && m.status === 'sent'
            );
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

    const unsubStatus = wsService.on('connection_status', (data) => {
      setIsWsConnected(data.isConnected);
      if (data.isConnected && isCurrent && activeConvIdRef.current === currentId) {
        syncMissedMessages(currentId);
      }
    });

    const unsubMsg = wsService.on('new_message', (data) => {
      const incomingMsg = data.message;
      if (String(incomingMsg.conversation_id) === String(activeConvIdRef.current)) {
        setMessages((prev) => {
          const merged = mergeMessages(prev, [incomingMsg]);
          cacheSet(`conv_msgs_${activeConvIdRef.current}`, merged, 60);
          return merged;
        });

        if (incomingMsg.sender_profile_id !== profileRef.current?.profile_id) {
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

        if (incomingMsg.sender_profile_id !== profileRef.current?.profile_id) {
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

    const unsubSeen = wsService.on('messages_seen', (data) => {
      if (String(data.conversation_id) === String(activeConvIdRef.current)) {
        setMessages((prev) => {
          let changed = false;
          const updated = prev.map((m) => {
            if (m.sender_profile_id === profileRef.current?.profile_id && m.status !== 'seen') {
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
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, [conversationId, scrollToBottom, syncMissedMessages, showToast]);

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

  const handleTouchStart = useCallback((msg, e) => {
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
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!longPressTimerRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 10 || dy > 10) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleContextMenu = useCallback((msg, e) => {
    if (msg.is_deleted) return;
    e.preventDefault();
    e.stopPropagation();
    setActiveMenuMessage(msg);
    setMenuPosition({
      x: Math.max(10, Math.min(e.clientX, window.innerWidth - 160)),
      y: Math.max(10, Math.min(e.clientY, window.innerHeight - 200)),
    });
  }, []);

  const handleThreeDotClick = useCallback((msg, e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveMenuMessage(msg);
    setMenuPosition({
      x: Math.max(10, Math.min(rect.left - 50, window.innerWidth - 160)),
      y: Math.max(10, Math.min(rect.bottom + 4, window.innerHeight - 200)),
    });
  }, []);

  const handleStartReply = useCallback((msg) => {
    if (!msg || msg.is_deleted) return;
    setActiveMenuMessage(null);
    setReplyingTo(msg);
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 50);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleJumpToMessage = useCallback(async (targetId) => {
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

    const currentId = activeConvIdRef.current;
    try {
      const res = await chatService.getMessages(currentId, { around_id: targetId, limit: 30 });
      if (res.success && res.messages?.length > 0 && activeConvIdRef.current === currentId) {
        setMessages((prev) => {
          if (activeConvIdRef.current !== currentId) return prev;
          const merged = mergeMessages(prev, res.messages);
          cacheSet(`conv_msgs_${currentId}`, merged, 60);
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
    } catch {
      showToast('Failed to load replied message.', 'error');
    }
  }, [showToast]);

  const handleCopyMessage = useCallback((msg) => {
    if (msg.content) {
      navigator.clipboard.writeText(msg.content);
      showToast('Copied to clipboard', 'success');
    }
    setActiveMenuMessage(null);
  }, [showToast]);

  const handleStartEdit = useCallback((msg) => {
    if (msg.is_deleted || msg.message_type !== 'text') return;
    setEditingMessageId(msg.id);
    setEditingText(msg.content);
    setActiveMenuMessage(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditingText('');
  }, []);

  const handleSaveEdit = useCallback(async (msgId) => {
    const trimmed = editingTextRef.current.trim();
    if (!trimmed) {
      showToast('Message cannot be empty', 'error');
      return;
    }

    const currentId = activeConvIdRef.current;
    const originalMsg = messagesRef.current.find((m) => m.id === msgId);
    const prevContent = originalMsg?.content;

    setMessages((prev) => {
      const updated = prev.map((m) => (m.id === msgId ? { ...m, content: trimmed, is_edited: true } : m));
      cacheSet(`conv_msgs_${currentId}`, updated, 60);
      return updated;
    });
    setEditingMessageId(null);
    setEditingText('');

    try {
      const res = await chatService.editMessage(currentId, msgId, trimmed);
      if (!res.success) {
        setMessages((prev) => {
          const reverted = prev.map((m) =>
            m.id === msgId ? { ...m, content: prevContent, is_edited: originalMsg?.is_edited } : m
          );
          cacheSet(`conv_msgs_${currentId}`, reverted, 60);
          return reverted;
        });
        showToast(res.message || 'Failed to edit message', 'error');
      }
    } catch (err) {
      setMessages((prev) => {
        const reverted = prev.map((m) =>
          m.id === msgId ? { ...m, content: prevContent, is_edited: originalMsg?.is_edited } : m
        );
        cacheSet(`conv_msgs_${currentId}`, reverted, 60);
        return reverted;
      });
      showToast(err.message || 'Failed to edit message', 'error');
    }
  }, [showToast]);

  const handlePromptDelete = useCallback((msg) => {
    setDeletingMessage(msg);
    setActiveMenuMessage(null);
    setIsDeleteModalOpen(true);
  }, []);

  const handleConfirmDelete = async (type) => {
    if (!deletingMessage) return;
    const msgId = deletingMessage.id;
    const originalMsg = deletingMessage;
    const currentId = activeConvIdRef.current;

    setIsDeleting(true);

    if (type === 'me') {
      setMessages((prev) => {
        const filtered = prev.filter((m) => m.id !== msgId);
        cacheSet(`conv_msgs_${currentId}`, filtered, 60);
        return filtered;
      });
    } else {
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m.id === msgId ? { ...m, is_deleted: true, content: '', audio_url: null } : m
        );
        cacheSet(`conv_msgs_${currentId}`, updated, 60);
        return updated;
      });
    }

    setIsDeleteModalOpen(false);
    setDeletingMessage(null);

    try {
      const res = await chatService.deleteMessage(currentId, msgId, type);
      if (!res.success) {
        setMessages((prev) => {
          const reverted = mergeMessages(prev, [originalMsg]);
          cacheSet(`conv_msgs_${currentId}`, reverted, 60);
          return reverted;
        });
        showToast(res.message || 'Failed to delete message', 'error');
      }
    } catch (err) {
      setMessages((prev) => {
        const reverted = mergeMessages(prev, [originalMsg]);
        cacheSet(`conv_msgs_${currentId}`, reverted, 60);
        return reverted;
      });
      showToast(err.message || 'Failed to delete message', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const loadOlderMessages = useCallback(async () => {
    const targetId = activeConvIdRef.current;
    const currentMsgs = messagesRef.current;
    if (currentMsgs.length === 0 || loadingOlderRef.current) return;

    const container = chatContainerRef.current;
    const oldScrollHeight = container ? container.scrollHeight : 0;
    setLoadingOlder(true);

    const oldestMsg = currentMsgs.find((m) => m.id && !String(m.id).startsWith('temp-'));
    if (!oldestMsg) {
      setLoadingOlder(false);
      return;
    }

    try {
      const res = await chatService.getMessages(targetId, { before_id: oldestMsg.id, limit: 30 });
      if (res.success && activeConvIdRef.current === targetId) {
        setMessages((prev) => {
          if (activeConvIdRef.current !== targetId) return prev;
          const merged = mergeMessages(prev, res.messages || []);
          cacheSet(`conv_msgs_${targetId}`, merged, 60);
          return merged;
        });
        setHasMore(res.has_more);

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
  }, []);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const fromBottom = scrollHeight - scrollTop - clientHeight;
    isNearBottomRef.current = fromBottom < 100;
    setShowScrollBottom(fromBottom >= 150);

    if (scrollTop < 50 && hasMoreRef.current && !loadingOlderRef.current) {
      loadOlderMessages();
    }
  }, [loadOlderMessages]);

  const buildOptimisticReply = (replyTarget) => {
    if (!replyTarget) return null;
    return {
      id: replyTarget.id,
      sender_profile_id: replyTarget.sender_profile_id,
      sender_display_name: replyTarget.sender_display_name,
      content: replyTarget.content,
      message_type: replyTarget.message_type,
      duration_seconds: replyTarget.duration_seconds,
      thumbnail_url: replyTarget.thumbnail_url || replyTarget.image_url || replyTarget.local_preview_url,
      is_deleted: !!replyTarget.is_deleted,
    };
  };

  const handleSendText = useCallback(async (text) => {
    const currentId = activeConvIdRef.current;
    const clientMsgId = `cli-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const replyTarget = replyingToRef.current;
    const replyToId = replyTarget?.id && !String(replyTarget.id).startsWith('temp-') ? replyTarget.id : null;

    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      client_message_id: clientMsgId,
      conversation_id: Number(currentId),
      sender_profile_id: profileRef.current?.profile_id,
      sender_display_name: profileRef.current?.display_name,
      content: text,
      status: 'sending',
      created_at: new Date().toISOString(),
      reply_to_id: replyToId,
      reply_to_details: buildOptimisticReply(replyTarget),
    };

    setMessages((prev) => {
      const updated = [...prev, optimisticMsg];
      cacheSet(`conv_msgs_${currentId}`, updated, 60);
      return updated;
    });
    setReplyingTo(null);
    setTimeout(() => scrollToBottom('smooth'), 40);

    const sentWs = wsService.sendMessage(currentId, text, clientMsgId, replyToId);
    if (!sentWs) {
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
  }, [scrollToBottom, showToast]);

  const handleRetry = useCallback(async (failedMsg) => {
    if (!failedMsg || !failedMsg.client_message_id) return;
    const currentId = activeConvIdRef.current;

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
          const res = await chatService.sendVoiceMessage(
            currentId,
            blob,
            failedMsg.duration_seconds,
            failedMsg.client_message_id
          );
          if (res.success && activeConvIdRef.current === currentId) {
            setMessages((prev) => {
              const merged = mergeMessages(prev, [res.message]);
              cacheSet(`conv_msgs_${currentId}`, merged, 60);
              return merged;
            });
            return;
          }
        }
      } catch {
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
      } catch {
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
  }, [showToast]);

  const handleSendVoiceMessage = useCallback(async (audioBlob, durationSec) => {
    const currentId = activeConvIdRef.current;
    const clientMsgId = `cli-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const localBlobUrl = URL.createObjectURL(audioBlob);
    const replyTarget = replyingToRef.current;
    const replyToId = replyTarget?.id && !String(replyTarget.id).startsWith('temp-') ? replyTarget.id : null;

    const optimisticVoiceMsg = {
      id: `temp-${Date.now()}`,
      client_message_id: clientMsgId,
      conversation_id: Number(currentId),
      sender_profile_id: profileRef.current?.profile_id,
      sender_display_name: profileRef.current?.display_name,
      content: '',
      message_type: 'voice',
      audio_url: localBlobUrl,
      duration_seconds: Math.round(durationSec) || 1,
      status: 'sending',
      created_at: new Date().toISOString(),
      reply_to_id: replyToId,
      reply_to_details: buildOptimisticReply(replyTarget),
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
  }, [scrollToBottom, showToast]);

  const sendImageFile = useCallback(async (file, existingClientMsgId = null) => {
    const currentId = activeConvIdRef.current;
    if (!currentId || !file) return;

    if (file.size > 10 * 1024 * 1024) {
      showToast('Image exceeds 10MB limit.', 'error');
      return;
    }

    const clientMsgId = existingClientMsgId || `img-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const { file: uploadFile, width: imgWidth, height: imgHeight } = await compressImageFile(file, {
      maxDimension: 1600,
      quality: 0.82,
    });
    pendingImageFilesRef.current.set(clientMsgId, uploadFile);

    const replyTarget = replyingToRef.current;
    const replyToId = replyTarget?.id && !String(replyTarget.id).startsWith('temp-') ? replyTarget.id : null;
    const localPreviewUrl = URL.createObjectURL(uploadFile);

    const optimisticImgMsg = {
      id: clientMsgId,
      client_message_id: clientMsgId,
      conversation_id: currentId,
      sender_profile_id: profileRef.current?.profile_id,
      sender_display_name: profileRef.current?.display_name,
      message_type: 'image',
      image_width: imgWidth,
      image_height: imgHeight,
      local_preview_url: localPreviewUrl,
      status: 'sending',
      created_at: new Date().toISOString(),
      reply_to_id: replyToId,
      reply_to_details: buildOptimisticReply(replyTarget),
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
      const res = await chatService.sendImageMessage(currentId, uploadFile, clientMsgId, null, replyToId);
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
  }, [scrollToBottom, showToast]);

  const handleRetryImage = useCallback((msg) => {
    const file = pendingImageFilesRef.current.get(msg.client_message_id);
    if (file) {
      sendImageFile(file, msg.client_message_id);
    } else {
      showToast('Please re-select the photo to retry.', 'info');
    }
  }, [sendImageFile, showToast]);

  const handleBack = useCallback(() => navigate('/dashboard'), [navigate]);
  const handleScrollBottomClick = useCallback(() => scrollToBottom('smooth'), [scrollToBottom]);
  const handleComposerError = useCallback((msg) => showToast(msg, 'error'), [showToast]);

  const otherUser = conversation?.other_participant;

  return (
    <div className="flex flex-col h-full md:h-[calc(100vh-8rem)] w-full max-w-4xl mx-auto md:rounded-3xl chat-liquid-bg md:border md:border-black/[0.06] dark:md:border-white/[0.1] shadow-xl overflow-hidden relative">
      <ChatHeader
        otherUser={otherUser}
        otherUserTyping={otherUserTyping}
        isWsConnected={isWsConnected}
        onBack={handleBack}
      />

      <MessageList
        chatContainerRef={chatContainerRef}
        messagesEndRef={messagesEndRef}
        onScroll={handleScroll}
        loadingOlder={loadingOlder}
        isLoading={isLoading}
        messages={messages}
        otherUser={otherUser}
        otherUserTyping={otherUserTyping}
        currentProfileId={profile?.profile_id}
        editingMessageId={editingMessageId}
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

      <ScrollToBottomButton
        visible={showScrollBottom}
        onClick={handleScrollBottomClick}
      />

      <MessageComposer
        conversationId={conversationId}
        currentProfileId={profile?.profile_id}
        replyingTo={replyingTo}
        onCancelReply={handleCancelReply}
        onSendText={handleSendText}
        onSendImage={sendImageFile}
        onSendVoice={handleSendVoiceMessage}
        onError={handleComposerError}
        messageInputRef={messageInputRef}
      />

      {/* Floating Liquid Glass Context Menu */}
      {activeMenuMessage && menuPosition && (
        <div
          style={{ top: `${menuPosition.y}px`, left: `${menuPosition.x}px` }}
          className="lynqo-modal-enter liquid-glass-sheet fixed z-50 min-w-[164px] rounded-2xl py-1.5 text-[13px] text-[#38323F] dark:text-[#F1F5F9]"
          onClick={(e) => e.stopPropagation()}
        >
          {!activeMenuMessage.is_deleted && (
            <button
              type="button"
              onClick={() => handleStartReply(activeMenuMessage)}
              className="w-full px-3.5 py-2.5 text-left hover:bg-[#9880D9]/15 flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <Reply className="w-4 h-4 text-[#7960BC] dark:text-[#9880D9]" />
              <span>Reply</span>
            </button>
          )}

          {activeMenuMessage.message_type === 'text' && activeMenuMessage.content && (
            <button
              type="button"
              onClick={() => handleCopyMessage(activeMenuMessage)}
              className="w-full px-3.5 py-2.5 text-left hover:bg-[#9880D9]/15 flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <Copy className="w-4 h-4 text-[#93889D] dark:text-[#94A3B8]" />
              <span>Copy</span>
            </button>
          )}

          {activeMenuMessage.sender_profile_id === profile?.profile_id &&
            activeMenuMessage.message_type === 'text' &&
            !activeMenuMessage.is_deleted && (
              <button
                type="button"
                onClick={() => handleStartEdit(activeMenuMessage)}
                className="w-full px-3.5 py-2.5 text-left hover:bg-[#9880D9]/15 flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <Edit2 className="w-4 h-4 text-[#7960BC] dark:text-[#9880D9]" />
                <span>Edit</span>
              </button>
            )}

          {!activeMenuMessage.is_deleted && (
            <button
              type="button"
              onClick={() => handlePromptDelete(activeMenuMessage)}
              className="w-full px-3.5 py-2.5 text-left hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center gap-2.5 cursor-pointer transition-colors"
            >
              <Trash2 className="w-4 h-4" />
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
    </div>
  );
};

export default Chat;

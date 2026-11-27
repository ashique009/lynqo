import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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
import { markBusy } from '../utils/busyTracker';
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
  const [newMessagesCount, setNewMessagesCount] = useState(0);
  const [unreadBannerInfo, setUnreadBannerInfo] = useState(() => {
    const cached = cacheGet(`conv_msgs_${conversationId}`);
    if (!cached || cached.length === 0) return null;
    const firstUnread = cached.find(
      (m) => m.sender_profile_id !== profile?.profile_id && m.status !== 'seen' && !m.is_read
    );
    if (!firstUnread) return null;
    const count = cached.filter(
      (m) => m.sender_profile_id !== profile?.profile_id && m.status !== 'seen' && !m.is_read
    ).length;
    return { firstUnreadId: firstUnread.id, count };
  });
  const [isPositionReady, setIsPositionReady] = useState(false);

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
  const [composerHeight, setComposerHeight] = useState(88);

  const messageInputRef = useRef(null);
  const composerContainerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const otherTypingTimeoutRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const pendingImageFilesRef = useRef(new Map());
  const pendingAckCleanersRef = useRef(new Map());
  const pendingInitialScrollRef = useRef(null);

  // Measure dynamic composer height (multi-line typing, reply preview, voice recorder)
  useEffect(() => {
    const el = composerContainerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.round(entry.borderBoxSize?.[0]?.blockSize || el.offsetHeight);
        if (h > 0) {
          setComposerHeight(h);
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // When composer height changes, keep messages anchored cleanly at bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      requestAnimationFrame(() => {
        const container = chatContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      });
    }
  }, [composerHeight]);

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
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
    setShowScrollBottom(false);
    setNewMessagesCount(0);
  }, []);

  // Pre-paint deterministic initial scroll positioning (zero-flicker before browser paint)
  useLayoutEffect(() => {
    if (isLoading || messages.length === 0) return;

    let pending = pendingInitialScrollRef.current;
    if (!pending && !isPositionReady) {
      const firstUnread = messages.find(
        (m) => m.sender_profile_id !== profileRef.current?.profile_id && m.status !== 'seen' && !m.is_read
      );
      pending = firstUnread
        ? { type: 'unread', id: firstUnread.id, convId: activeConvIdRef.current, markSeenOnReady: false }
        : { type: 'bottom', convId: activeConvIdRef.current, markSeenOnReady: false };
    }
    if (!pending) return;
    if (String(pending.convId) !== String(activeConvIdRef.current)) return;

    const container = chatContainerRef.current;
    if (!container) return;

    pendingInitialScrollRef.current = null;

    if (pending.type === 'unread') {
      const targetEl =
        document.getElementById('unread-divider') ||
        document.getElementById(`msg-${pending.id}`);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
        const fromBottom =
          container.scrollHeight - container.scrollTop - container.clientHeight;
        isNearBottomRef.current = fromBottom < 100;
        setShowScrollBottom(fromBottom >= 150);
      } else {
        container.scrollTop = container.scrollHeight;
        isNearBottomRef.current = true;
        setShowScrollBottom(false);
      }
    } else {
      container.scrollTop = container.scrollHeight;
      isNearBottomRef.current = true;
      setShowScrollBottom(false);
      setNewMessagesCount(0);
    }

    requestAnimationFrame(() => {
      if (isNearBottomRef.current && chatContainerRef.current) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    });

    container.style.opacity = '1';
    setIsPositionReady(true);

    if (
      pending.markSeenOnReady &&
      (typeof document === 'undefined' || document.visibilityState === 'visible')
    ) {
      wsService.markSeen(pending.convId);
    }
  }, [messages, isLoading, unreadBannerInfo]);

  // Preserve bottom position when mobile keyboard opens while near bottom
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewportResize = () => {
      if (isNearBottomRef.current) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
    };
    vv.addEventListener('resize', onViewportResize);
    return () => vv.removeEventListener('resize', onViewportResize);
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
      const res = await chatService.getMessages(targetId, { since_id: latestId, mark_read: false });
      if (res.success && res.messages?.length > 0 && activeConvIdRef.current === targetId) {
        setMessages((prev) => {
          if (activeConvIdRef.current !== targetId) return prev;
          const merged = mergeMessages(prev, res.messages);
          cacheSet(`conv_msgs_${targetId}`, merged, 60);
          return merged;
        });
        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom('smooth'), 50);
          if (typeof document === 'undefined' || document.visibilityState === 'visible') {
            wsService.markSeen(targetId);
          }
        } else {
          const incomingCount = res.messages.filter(
            (m) => m.sender_profile_id !== profileRef.current?.profile_id && !m.is_read && m.status !== 'seen'
          ).length;
          if (incomingCount > 0) {
            setNewMessagesCount((c) => c + incomingCount);
            setShowScrollBottom(true);
          }
        }
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

    const hasCachedMsgs = Boolean(cachedMsgs && cachedMsgs.length > 0);
    const initialMessages = hasCachedMsgs ? cachedMsgs : [];
    setMessages(initialMessages);
    setIsLoading(!hasCachedMsgs);
    if (!hasCachedMsgs) {
      setIsPositionReady(false);
    }
    setOtherUserTyping(false);
    setReplyingTo(null);
    setUnreadBannerInfo(null);
    setNewMessagesCount(0);

    // If cached messages exist, schedule pre-paint positioning immediately so frame 1 is never at scrollTop=0
    if (hasCachedMsgs) {
      const cachedUnread = cachedMsgs.find(
        (m) => m.sender_profile_id !== profileRef.current?.profile_id && m.status !== 'seen' && !m.is_read
      );
      if (cachedUnread) {
        const cachedUnreadCount = cachedMsgs.filter(
          (m) => m.sender_profile_id !== profileRef.current?.profile_id && m.status !== 'seen' && !m.is_read
        ).length;
        setUnreadBannerInfo({ firstUnreadId: cachedUnread.id, count: cachedUnreadCount });
        pendingInitialScrollRef.current = { type: 'unread', id: cachedUnread.id, convId: currentId, markSeenOnReady: false };
      } else {
        pendingInitialScrollRef.current = { type: 'bottom', convId: currentId, markSeenOnReady: false };
      }
    }

    wsService.joinConversation(currentId);

    let initialPositionResolved = false;

    const scheduleInitialPosition = (firstUnreadId) => {
      if (initialPositionResolved) return;
      initialPositionResolved = true;
      pendingInitialScrollRef.current = firstUnreadId
        ? { type: 'unread', id: firstUnreadId, convId: currentId, markSeenOnReady: true }
        : { type: 'bottom', convId: currentId, markSeenOnReady: true };
    };

    const loadInitialData = async () => {
      let resolvedFirstUnreadId = null;
      try {
        const cachedConvData = location.state?.conversation || cacheGet(`conv_detail_${currentId}`);
        const latestCachedMsgs = cacheGet(`conv_msgs_${currentId}`);

        let msgPromise;
        if (latestCachedMsgs && latestCachedMsgs.length > 0) {
          const realMsgs = latestCachedMsgs.filter((m) => m.id && !String(m.id).startsWith('temp-'));
          const latestId = realMsgs.length > 0 ? Math.max(...realMsgs.map((m) => Number(m.id))) : null;
          if (latestId && isFinite(latestId)) {
            msgPromise = chatService.getMessages(currentId, { since_id: latestId, mark_read: false });
          } else {
            msgPromise = chatService.getMessages(currentId, { limit: 50, mark_read: false });
          }
        } else {
          msgPromise = chatService.getMessages(currentId, { limit: 50, mark_read: false });
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
          let msgs = msgRes.messages || [];
          let firstUnreadId = msgRes.first_unread_id || null;
          let unreadCount = msgRes.unread_count || 0;

          // Fallback: check merged messages if backend metadata was absent
          let combinedMsgs = mergeMessages(messagesRef.current || [], msgs);
          if (!firstUnreadId && combinedMsgs.length > 0) {
            const firstLocalUnread = combinedMsgs.find(
              (m) =>
                m.sender_profile_id !== profileRef.current?.profile_id &&
                m.status !== 'seen' &&
                !m.is_read
            );
            if (firstLocalUnread) {
              firstUnreadId = firstLocalUnread.id;
              unreadCount = combinedMsgs.filter(
                (m) =>
                  m.sender_profile_id !== profileRef.current?.profile_id &&
                  m.status !== 'seen' &&
                  !m.is_read
              ).length;
            }
          }

          // If first unread message is outside the loaded page (>50 unread), load around_id
          if (firstUnreadId && !combinedMsgs.some((m) => m.id === firstUnreadId)) {
            const aroundRes = await chatService.getMessages(currentId, {
              around_id: firstUnreadId,
              limit: 60,
              mark_read: false,
            });
            if (!isCurrent || activeConvIdRef.current !== currentId) return;
            if (aroundRes.success && aroundRes.messages?.length > 0) {
              combinedMsgs = aroundRes.messages;
              if (aroundRes.has_more !== undefined) {
                setHasMore(aroundRes.has_more);
              }
            }
          } else if (msgRes.has_more !== undefined) {
            setHasMore(msgRes.has_more);
          }

          if (combinedMsgs.length > 0) {
            setMessages(combinedMsgs);
            cacheSet(`conv_msgs_${currentId}`, combinedMsgs, 60);

            const incomingUndelivered = combinedMsgs.filter(
              (m) => m.sender_profile_id !== profileRef.current?.profile_id && m.status === 'sent'
            );
            if (incomingUndelivered.length > 0) {
              wsService.markDelivered(currentId, incomingUndelivered.map((m) => m.id));
            }
          }

          if (firstUnreadId && unreadCount > 0) {
            resolvedFirstUnreadId = firstUnreadId;
            setUnreadBannerInfo({ firstUnreadId, count: unreadCount });
          } else {
            setUnreadBannerInfo(null);
          }
        }
      } catch (err) {
        if (!isCurrent || activeConvIdRef.current !== currentId) return;
        showToast(err.message || 'Failed to load conversation.', 'error');
      } finally {
        if (isCurrent && activeConvIdRef.current === currentId) {
          setIsLoading(false);
          scheduleInitialPosition(resolvedFirstUnreadId);
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
          if (isNearBottomRef.current && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
            wsService.markSeen(activeConvIdRef.current);
          }
        }

        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom('smooth'), 50);
        } else {
          setShowScrollBottom(true);
          if (incomingMsg.sender_profile_id !== profileRef.current?.profile_id) {
            setNewMessagesCount((c) => c + 1);
          }
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
          if (isNearBottomRef.current && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
            wsService.markSeen(activeConvIdRef.current);
          }
        }

        if (isNearBottomRef.current) {
          setTimeout(() => scrollToBottom('smooth'), 50);
        } else {
          setShowScrollBottom(true);
          if (incomingMsg.sender_profile_id !== profileRef.current?.profile_id) {
            setNewMessagesCount((c) => c + 1);
          }
        }
      }
    });

    const unsubAck = wsService.on('message_ack', (data) => {
      if (data?.client_message_id) {
        const cleaner = pendingAckCleanersRef.current.get(data.client_message_id);
        if (cleaner) {
          cleaner();
          pendingAckCleanersRef.current.delete(data.client_message_id);
        }
      }
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
    if (dx > 18 || dy > 18) {
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
      const res = await chatService.getMessages(currentId, { around_id: targetId, limit: 30, mark_read: false });
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
      const res = await chatService.getMessages(targetId, { before_id: oldestMsg.id, limit: 30, mark_read: false });
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
    const nowNearBottom = fromBottom < 100;
    isNearBottomRef.current = nowNearBottom;
    setShowScrollBottom(fromBottom >= 150);

    if (nowNearBottom) {
      setNewMessagesCount((prev) => {
        if (prev > 0 && activeConvIdRef.current) {
          wsService.markSeen(activeConvIdRef.current);
        }
        return 0;
      });
    }

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
    requestAnimationFrame(() => {
      scrollToBottom('smooth');
      setTimeout(() => scrollToBottom('smooth'), 50);
    });

    const sentWs = wsService.sendMessage(currentId, text, clientMsgId, replyToId);
    if (!sentWs) {
      const clearBusy = markBusy();
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
      } finally {
        clearBusy();
      }
    } else {
      const clearBusy = markBusy();
      pendingAckCleanersRef.current.set(clientMsgId, clearBusy);
      setTimeout(() => {
        const cleaner = pendingAckCleanersRef.current.get(clientMsgId);
        if (cleaner) {
          cleaner();
          pendingAckCleanersRef.current.delete(clientMsgId);
        }
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
    requestAnimationFrame(() => {
      scrollToBottom('smooth');
      setTimeout(() => scrollToBottom('smooth'), 50);
    });

    const clearBusy = markBusy();
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
    } finally {
      clearBusy();
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
    requestAnimationFrame(() => {
      scrollToBottom('smooth');
      setTimeout(() => scrollToBottom('smooth'), 50);
    });

    const clearBusy = markBusy();
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
    } finally {
      clearBusy();
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
  const handleScrollBottomClick = useCallback(() => {
    scrollToBottom('smooth');
    if (activeConvIdRef.current) {
      wsService.markSeen(activeConvIdRef.current);
    }
  }, [scrollToBottom]);
  const handleComposerError = useCallback((msg) => showToast(msg, 'error'), [showToast]);

  const otherUser = conversation?.other_participant;

  return (
    <div className="flex flex-col h-full md:h-[calc(100dvh-8rem)] w-full max-w-4xl mx-auto md:rounded-3xl chat-liquid-bg md:border md:border-black/[0.06] dark:md:border-white/[0.1] shadow-xl overflow-hidden relative">
      <ChatHeader
        otherUser={otherUser}
        otherUserTyping={otherUserTyping}
        isWsConnected={isWsConnected}
        onBack={handleBack}
      />

      <MessageList
        chatContainerRef={chatContainerRef}
        messagesEndRef={messagesEndRef}
        composerHeight={composerHeight}
        onScroll={handleScroll}
        loadingOlder={loadingOlder}
        isLoading={isLoading}
        isPositionReady={isPositionReady}
        messages={messages}
        unreadBannerInfo={unreadBannerInfo}
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
        unreadCount={newMessagesCount}
        onClick={handleScrollBottomClick}
        bottomOffset={composerHeight + 12}
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
        composerRef={composerContainerRef}
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

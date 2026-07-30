import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { chatService } from '../services/chatService';
import { authService } from '../services/authService';
import { formatRelativeTime } from '../utils/timeUtils';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import Modal from '../components/Modal';
import { Send, ArrowLeft, User, MoreVertical, Pencil, Trash2, Check, X, Ban, AlertTriangle, Mic, Square, ChevronUp, ChevronLeft } from 'lucide-react';
import VoiceMessagePlayer from '../components/VoiceMessagePlayer';

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

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [isEditingSaving, setIsEditingSaving] = useState(false);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState(null);
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Voice message states
  const [recordingState, setRecordingState] = useState('idle'); // 'idle' | 'recording' | 'locked' | 'review'
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const [reviewAudioUrl, setReviewAudioUrl] = useState(null);
  const [reviewAudioBlob, setReviewAudioBlob] = useState(null);
  const [reviewDuration, setReviewDuration] = useState(0);

  // Voice message refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerIntervalRef = useRef(null);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef(null);
  const isDragCancelledRef = useRef(false);
  const isDragLockedRef = useRef(false);
  const isReviewModeRef = useRef(false);

  const messagesEndRef = useRef(null);
  const pollingTimerRef = useRef(null);
  const statusTimerRef = useRef(null);
  const typingStatusTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = () => {
      setActiveMenuMessageId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

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

  // Clean up recording timer and object URLs on unmount/url change
  useEffect(() => {
    return () => {
      if (recordingTimerIntervalRef.current) {
        clearInterval(recordingTimerIntervalRef.current);
      }
      if (reviewAudioUrl) {
        URL.revokeObjectURL(reviewAudioUrl);
      }
    };
  }, [reviewAudioUrl]);

  const getSupportedMimeType = () => {
    const types = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }
    return '';
  };

  const handlePointerDown = async (e) => {
    // Only handle left mouse click or touch/pen pointers
    if (e.button !== undefined && e.button !== 0) return;
    
    // Prevent default actions to stop text selection/scrolling
    e.preventDefault();
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Capture pointer events on the target element
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerIdRef.current = e.pointerId;
      
      // Initialize drag start coordinates
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      setDragDeltaX(0);
      setDragDeltaY(0);
      isDragCancelledRef.current = false;
      isDragLockedRef.current = false;
      isReviewModeRef.current = false;
      
      audioChunksRef.current = [];
      const options = { mimeType: getSupportedMimeType() };
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Stop all track streams to turn off mic hardware indicator
        stream.getTracks().forEach((track) => track.stop());
        
        if (isDragCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || 'audio/webm' });
        
        if (isReviewModeRef.current) {
          const url = URL.createObjectURL(audioBlob);
          setReviewAudioUrl(url);
          setReviewAudioBlob(audioBlob);
          setRecordingState('review');
        } else {
          // Send immediately
          await sendVoiceMessage(audioBlob, recordingSeconds || 1);
          setRecordingState('idle');
        }
      };
      
      setRecordingSeconds(0);
      setRecordingState('recording');
      mediaRecorder.start();
      
      recordingTimerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
      
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      showToast('Microphone access is required to send voice messages', 'error');
    }
  };

  const handlePointerMove = (e) => {
    if (recordingState !== 'recording') return;
    if (pointerIdRef.current !== e.pointerId) return;
    
    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;
    
    setDragDeltaX(deltaX);
    setDragDeltaY(deltaY);
    
    // DRAG LEFT: cancel threshold (e.g. 100-120px) -> let's use 110px
    if (deltaX < -110) {
      cancelRecording(e.currentTarget);
      return;
    }
    
    // DRAG UP: lock threshold (e.g. 60-80px) -> let's use 70px
    if (deltaY < -70) {
      lockRecording(e.currentTarget);
    }
  };

  const handlePointerUp = (e) => {
    if (recordingState !== 'recording') return;
    if (pointerIdRef.current !== e.pointerId) return;
    
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (err) {}
    pointerIdRef.current = null;
    
    // Stop recording and send immediately
    stopRecording(false);
  };

  const cancelRecording = (target) => {
    isDragCancelledRef.current = true;
    if (target && pointerIdRef.current !== null) {
      try {
        target.releasePointerCapture(pointerIdRef.current);
      } catch (err) {}
    }
    pointerIdRef.current = null;
    
    stopRecording(true);
    showToast('Recording cancelled', 'success');
  };

  const lockRecording = (target) => {
    isDragLockedRef.current = true;
    setRecordingState('locked');
    if (target && pointerIdRef.current !== null) {
      try {
        target.releasePointerCapture(pointerIdRef.current);
      } catch (err) {}
    }
    pointerIdRef.current = null;
  };

  const stopRecording = (discard = false) => {
    if (recordingTimerIntervalRef.current) {
      clearInterval(recordingTimerIntervalRef.current);
      recordingTimerIntervalRef.current = null;
    }
    
    if (discard) {
      isDragCancelledRef.current = true;
    }
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (discard) {
      setRecordingState('idle');
      setRecordingSeconds(0);
    }
  };

  const handleStopRecordingLocked = () => {
    isReviewModeRef.current = true;
    setReviewDuration(recordingSeconds);
    stopRecording(false);
  };

  const handleDiscardReview = () => {
    if (reviewAudioUrl) {
      URL.revokeObjectURL(reviewAudioUrl);
    }
    setReviewAudioUrl(null);
    setReviewAudioBlob(null);
    setReviewDuration(0);
    setRecordingState('idle');
  };

  const handleSendReview = async () => {
    if (!reviewAudioBlob) return;
    const blobToSend = reviewAudioBlob;
    const durationToSend = reviewDuration || 1;
    handleDiscardReview();
    await sendVoiceMessage(blobToSend, durationToSend);
  };

  const sendVoiceMessage = async (audioBlob, duration) => {
    setSending(true);
    try {
      const audioFile = new File([audioBlob], 'voice_message.webm', { type: audioBlob.type });
      const response = await chatService.sendVoiceMessage(conversationId, audioFile, duration);
      if (response.success && response.data) {
        setMessages((prev) => [...prev, response.data]);
        scrollToBottom();
      } else {
        showToast('Failed to send voice message.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to send voice message.', 'error');
    } finally {
      setSending(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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

  const handleStartEdit = (msg, e) => {
    e.stopPropagation();
    setEditingMessageId(msg.id);
    setEditContent(msg.content);
    setActiveMenuMessageId(null);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (msgId) => {
    if (!editContent.trim()) {
      showToast('Message cannot be empty.', 'error');
      return;
    }
    setIsEditingSaving(true);
    try {
      const res = await chatService.editMessage(msgId, editContent.trim());
      if (res.success && res.data) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? res.data : m))
        );
        setEditingMessageId(null);
        setEditContent('');
        showToast('Message updated.', 'success');
      } else {
        showToast(res.message || 'Failed to edit message.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to edit message.', 'error');
    } finally {
      setIsEditingSaving(false);
    }
  };

  const handleStartDelete = (msgId, e) => {
    e.stopPropagation();
    setDeletingMessageId(msgId);
    setIsDeleteModalOpen(true);
    setActiveMenuMessageId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingMessageId) return;
    setIsDeleting(true);
    try {
      const res = await chatService.deleteMessage(deletingMessageId);
      if (res.success && res.data) {
        setMessages((prev) =>
          prev.map((m) => (m.id === deletingMessageId ? res.data : m))
        );
        setIsDeleteModalOpen(false);
        setDeletingMessageId(null);
        showToast('Message deleted.', 'success');
      } else {
        showToast(res.message || 'Failed to delete message.', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete message.', 'error');
    } finally {
      setIsDeleting(false);
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
            const isEditing = editingMessageId === msg.id;
            const isDeleted = msg.is_deleted;
            const isMenuOpen = activeMenuMessageId === msg.id;

            if (isDeleted) {
              return (
                <div
                  key={msg.id}
                  className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-xs sm:text-sm italic flex items-center gap-2 border shadow-xs ${
                      isMe
                        ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 rounded-br-none border-slate-200 dark:border-slate-800'
                        : 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 rounded-bl-none border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <Ban className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
                    <span>This message was deleted</span>
                  </div>
                </div>
              );
            }

            if (isEditing) {
              return (
                <div
                  key={msg.id}
                  className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] p-3 rounded-2xl ${
                      isMe
                        ? 'bg-[#D4537E] dark:bg-brand-purple text-white rounded-br-none'
                        : 'bg-white dark:bg-brand-black/60 text-[#2C2C2A] dark:text-slate-200 rounded-bl-none'
                    } border border-[#D4537E]/30 dark:border-brand-purple-light/30 shadow-md`}
                  >
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSaveEdit(msg.id);
                          } else if (e.key === 'Escape') {
                            handleCancelEdit();
                          }
                        }}
                        className="w-full text-sm p-2.5 rounded-xl bg-white/20 dark:bg-black/30 border border-white/30 dark:border-slate-700/50 text-white dark:text-slate-100 placeholder-white/60 focus:outline-none focus:ring-1 focus:ring-white/50 resize-none"
                        rows={2}
                        autoFocus
                        disabled={isEditingSaving}
                      />
                      <div className="flex justify-end gap-1.5 items-center">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          disabled={isEditingSaving}
                          className="px-2.5 py-1 text-xs rounded-lg bg-black/20 hover:bg-black/30 text-white/90 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(msg.id)}
                          disabled={isEditingSaving || !editContent.trim()}
                          className="px-2.5 py-1 text-xs rounded-lg bg-white dark:bg-brand-purple-light text-[#D4537E] dark:text-brand-dark font-bold hover:bg-white/90 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3 h-3" /> Save
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`group relative flex w-full items-center gap-1 ${isMe ? 'justify-end' : 'justify-start'}`}
              >
                {/* Options Button for Sender (isMe) */}
                {isMe && (
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuMessageId(isMenuOpen ? null : msg.id);
                      }}
                      className="p-1 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800/60 opacity-70 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                      title="Message options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                    {/* Options Dropdown Menu */}
                    {isMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 bottom-full mb-1 z-30 min-w-[110px] py-1 bg-white dark:bg-slate-900 border border-[#F4C0D1] dark:border-slate-800 rounded-xl shadow-xl backdrop-blur-md animate-fade-in"
                      >
                        {msg.message_type !== 'voice' && (
                          <button
                            type="button"
                            onClick={(e) => handleStartEdit(msg, e)}
                            className="w-full px-3 py-1.5 text-xs text-left text-[#2C2C2A] dark:text-slate-200 hover:bg-[#F4C0D1]/20 dark:hover:bg-slate-800 flex items-center gap-2 cursor-pointer transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5 text-[#D4537E] dark:text-brand-purple-light" />
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => handleStartDelete(msg.id, e)}
                          className="w-full px-3 py-1.5 text-xs text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div
                  className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm ${
                    isMe
                      ? 'bg-[#D4537E] dark:bg-brand-purple text-white rounded-br-none border border-[#D4537E]/20 dark:border-brand-purple-light/20 shadow-md'
                      : 'bg-white dark:bg-brand-black/60 text-[#2C2C2A] dark:text-slate-200 rounded-bl-none border border-[#F4C0D1] dark:border-slate-800 shadow-xs'
                  }`}
                >
                  {msg.message_type === 'voice' ? (
                    <VoiceMessagePlayer
                      audioUrl={msg.audio_file}
                      duration={msg.duration_seconds}
                      isMe={isMe}
                    />
                  ) : (
                    <p className="leading-relaxed break-words text-left">{msg.content}</p>
                  )}
                  <div
                    className={`text-[8px] font-semibold mt-1 text-left flex items-center gap-1 ${
                      isMe ? 'text-pink-100 dark:text-purple-300' : 'text-[#5F5E5A] dark:text-slate-500'
                    }`}
                  >
                    <span>
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {msg.is_edited && (
                      <span className="italic opacity-85 text-[9px]">(edited)</span>
                    )}
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

      <form
        onSubmit={handleSend}
        className="relative p-4 border-t border-[#F4C0D1] dark:border-slate-900 flex gap-3 items-center bg-white/90 dark:bg-brand-black/35 backdrop-blur-md"
      >
        {recordingState === 'idle' && (
          <>
            <input
              type="text"
              className="flex-grow glass-input px-4 py-3 rounded-xl text-sm"
              placeholder="Type your message..."
              value={newMessage}
              onChange={handleInputChange}
              disabled={sending}
              required
            />
            
            {/* Mic Button */}
            <button
              type="button"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ touchAction: 'none' }}
              className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[#5F5E5A] dark:text-slate-400 rounded-xl border border-transparent transition-all duration-200 flex items-center justify-center flex-shrink-0 cursor-pointer shadow-xs relative select-none"
              title="Hold to record voice message"
            >
              <Mic className="w-4.5 h-4.5" />
            </button>

            {/* Send Button */}
            <button
              type="submit"
              className="p-3 bg-[#D4537E] hover:bg-[#c2436d] dark:bg-brand-purple dark:hover:bg-brand-purple-dark text-white rounded-xl border border-transparent dark:border-brand-purple-light/20 transition-all duration-200 flex items-center justify-center flex-shrink-0 cursor-pointer shadow-md shadow-[#D4537E]/10 dark:shadow-brand-purple/10 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={sending || !newMessage.trim()}
            >
              <Send className="w-4.5 h-4.5" />
            </button>
          </>
        )}

        {recordingState === 'recording' && (
          <div className="flex-grow flex items-center justify-between w-full h-[46px]">
            {/* Pulsing red dot and Timer */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-sm font-bold text-rose-500 dark:text-rose-400">
                {formatDuration(recordingSeconds)}
              </span>
            </div>

            {/* Slide to Cancel Indicator */}
            <div
              style={{
                transform: `translateX(${Math.min(0, dragDeltaX)}px)`,
                opacity: Math.max(0.1, 1 + dragDeltaX / 110),
              }}
              className="flex items-center gap-1 text-xs text-[#5F5E5A] dark:text-slate-400 font-semibold select-none transition-transform duration-75"
            >
              <ChevronLeft className="w-4 h-4 animate-pulse" />
              <span>Slide to cancel</span>
            </div>

            {/* Mic Button (Active) - remains mounted here */}
            <button
              type="button"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{ touchAction: 'none' }}
              className="p-3 bg-rose-500 text-white rounded-xl shadow-md shadow-rose-500/20 scale-110 flex items-center justify-center flex-shrink-0 relative select-none"
            >
              <Mic className="w-4.5 h-4.5 animate-pulse" />

              {/* Lock UI Indicator */}
              <div
                style={{
                  transform: `translate(-50%, ${Math.max(-70, Math.min(0, dragDeltaY))}px)`,
                  opacity: Math.max(0.1, 1 + dragDeltaY / 70),
                }}
                className="absolute bottom-14 left-1/2 flex flex-col items-center gap-0.5 text-[10px] text-[#5F5E5A] dark:text-slate-400 select-none pointer-events-none transition-transform duration-75"
              >
                <ChevronUp className="w-3.5 h-3.5 animate-bounce" />
                <span className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-md shadow-sm font-bold">
                  Lock
                </span>
              </div>
            </button>
          </div>
        )}

        {recordingState === 'locked' && (
          <div className="flex-grow flex items-center justify-between w-full h-[46px]">
            {/* Discard/Trash Button */}
            <button
              type="button"
              onClick={() => stopRecording(true)}
              className="p-2.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all duration-200 cursor-pointer"
              title="Discard recording"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            {/* Pulse Red Dot + Timer */}
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-sm font-bold text-rose-500 dark:text-rose-400">
                {formatDuration(recordingSeconds)}
              </span>
            </div>

            {/* Stop and Send Buttons */}
            <div className="flex items-center gap-2">
              {/* Stop Button */}
              <button
                type="button"
                onClick={handleStopRecordingLocked}
                className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-transparent transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs"
                title="Stop and preview"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>

              {/* Send Button */}
              <button
                type="button"
                onClick={() => stopRecording(false)}
                className="p-3 bg-[#D4537E] hover:bg-[#c2436d] dark:bg-brand-purple dark:hover:bg-brand-purple-dark text-white rounded-xl border border-transparent transition-all duration-200 flex items-center justify-center cursor-pointer shadow-md shadow-[#D4537E]/10"
                title="Send voice message"
              >
                <Send className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>
        )}

        {recordingState === 'review' && (
          <div className="flex-grow flex items-center justify-between w-full h-[46px] gap-3">
            {/* Discard/Trash Button */}
            <button
              type="button"
              onClick={handleDiscardReview}
              className="p-2.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all duration-200 cursor-pointer flex-shrink-0"
              title="Discard recording"
            >
              <Trash2 className="w-5 h-5" />
            </button>

            {/* Local Preview Player */}
            <div className="flex-grow bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 px-3 rounded-2xl flex items-center justify-center max-w-[320px] mx-auto">
              <VoiceMessagePlayer
                audioUrl={reviewAudioUrl}
                duration={reviewDuration}
                isMe={false}
              />
            </div>

            {/* Send Button */}
            <button
              type="button"
              onClick={handleSendReview}
              className="p-3 bg-[#D4537E] hover:bg-[#c2436d] dark:bg-brand-purple dark:hover:bg-brand-purple-dark text-white rounded-xl border border-transparent transition-all duration-200 flex items-center justify-center flex-shrink-0 cursor-pointer shadow-md shadow-[#D4537E]/10"
              title="Send voice message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </form>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsDeleteModalOpen(false);
            setDeletingMessageId(null);
          }
        }}
        title="Delete Message"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 text-rose-500">
            <AlertTriangle className="w-6 h-6 flex-shrink-0" />
            <p className="text-sm font-medium text-[#2C2C2A] dark:text-slate-200">
              Are you sure you want to delete this message? This action cannot be undone.
            </p>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeletingMessageId(null);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Chat;


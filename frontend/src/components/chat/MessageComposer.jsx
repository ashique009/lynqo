import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Mic, Lock, Trash2, Pause, Play, Image as ImageIcon, Camera, Plus
} from 'lucide-react';
import { wsService } from '../../services/websocketService';
import useVoiceRecorder from '../../hooks/useVoiceRecorder';
import CameraCaptureModal from '../CameraCaptureModal';
import { ReplyPreview } from './ReplyPreview';

const formatRecordingTime = (sec) => {
  if (!sec || isNaN(sec)) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const MessageComposer = React.memo(({
  conversationId,
  currentProfileId,
  replyingTo,
  onCancelReply,
  onSendText,
  onSendImage,
  onSendVoice,
  onError,
  messageInputRef,
}) => {
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  const imageInputRef = useRef(null);
  const attachMenuRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // Reset draft and typing state when switching conversations
  useEffect(() => {
    setInputText('');
    setIsTyping(false);
    setIsAttachMenuOpen(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [conversationId]);

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

  const {
    isRecording,
    isLocked,
    isPaused,
    duration: recordDuration,
    audioLevels,
    isCanceling,
    isNearLock,
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
    onSend: onSendVoice,
    onError,
    maxDuration: 120,
  });

  // Notify PWA updater when voice recording is active so reloads never interrupt recording
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isRecording) {
      window.__lynqoBusyCount = (window.__lynqoBusyCount || 0) + 1;
      return () => {
        window.__lynqoBusyCount = Math.max(0, (window.__lynqoBusyCount || 1) - 1);
        if (window.__lynqoBusyCount === 0) {
          window.dispatchEvent(new CustomEvent('lynqo:idle'));
        }
      };
    }
  }, [isRecording]);

  const handleInputChange = (e) => {
    const el = e.target;
    setInputText(el.value);

    // Auto-expand multiline textarea smoothly up to 120px
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;

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

  const handleSubmit = (e) => {
    e?.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed) return;

    setInputText('');
    if (messageInputRef?.current) {
      messageInputRef.current.style.height = 'auto';
    }
    setIsTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    wsService.sendTyping(conversationId, false);
    onSendText(trimmed);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImageInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (const f of files) {
      onSendImage(f);
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  return (
    <>
      {/* Floating Apple-inspired Liquid Glass Composer */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-2.5 sm:px-4 pt-2 pb-safe pointer-events-none">
        <div className="pointer-events-auto">
          <ReplyPreview
            replyingTo={replyingTo}
            currentProfileId={currentProfileId}
            onCancel={onCancelReply}
          />

          {isRecording ? (
            /* Premium Rounded Voice Recording Bottom Sheet */
            <div className="liquid-sheet-enter liquid-glass-sheet rounded-[26px] p-4 mb-1.5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      isPaused ? 'bg-amber-400' : 'bg-rose-500 animate-pulse motion-reduce:animate-none'
                    }`}
                  />
                  <span className="text-[13px] font-semibold text-[#38323F] dark:text-[#F1F5F9]">
                    Voice Recording
                  </span>
                </div>
                <span className="font-mono text-[14px] font-semibold tabular-nums text-[#7960BC] dark:text-[#9880D9]">
                  {formatRecordingTime(recordDuration)}
                </span>
              </div>

              {/* Live Waveform */}
              <div className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-2xl bg-[#F5F0FA]/80 dark:bg-[#0F172A]/60">
                {audioLevels.map((lvl, idx) => (
                  <div
                    key={idx}
                    style={{ height: `${Math.max(18, Math.round(lvl * 100))}%` }}
                    className={`w-1 rounded-full transition-all duration-75 ${
                      isPaused ? 'bg-[#93889D]/40' : 'bg-[#7960BC] dark:bg-[#9880D9]'
                    }`}
                  />
                ))}
              </div>

              {isLocked ? (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="min-w-[44px] min-h-[44px] rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
                    title="Discard recording"
                    aria-label="Discard recording"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>

                  <div className="flex items-center gap-2">
                    {isPaused && (
                      <button
                        type="button"
                        onClick={togglePreview}
                        className="min-w-[44px] min-h-[44px] rounded-full bg-[#F5F0FA] dark:bg-[#1E293B] text-[#7960BC] dark:text-[#F1F5F9] active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
                        title={isPlayingPreview ? 'Pause preview' : 'Listen to recording'}
                        aria-label={isPlayingPreview ? 'Pause preview' : 'Listen to recording'}
                      >
                        {isPlayingPreview ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={isPaused ? resumeRecording : pauseRecording}
                      className="min-w-[44px] min-h-[44px] rounded-full bg-[#F5F0FA] dark:bg-[#1E293B] text-[#38323F] dark:text-[#F1F5F9] active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
                      title={isPaused ? 'Resume recording' : 'Pause recording'}
                      aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
                    >
                      {isPaused ? <Mic className="w-5 h-5 text-[#7960BC]" /> : <Pause className="w-4 h-4 fill-current" />}
                    </button>

                    <button
                      type="button"
                      onClick={stopAndSend}
                      className="liquid-glass-gradient-btn min-w-[44px] min-h-[44px] px-4 rounded-full active:scale-95 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-transform cursor-pointer"
                      title="Send voice message"
                      aria-label="Send voice message"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative flex items-center justify-between gap-2">
                  <div
                    className={`absolute -top-14 right-0 px-3 py-1.5 rounded-full liquid-glass-pill text-xs flex items-center gap-1.5 transition-transform ${
                      isNearLock ? 'text-[#7960BC] scale-105' : 'text-[#93889D]'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Slide up to lock</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 text-xs transition-colors ${
                      isCanceling ? 'text-rose-600 font-semibold' : 'text-[#93889D] dark:text-[#94A3B8]'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{isCanceling ? 'Release to cancel' : 'Slide left to cancel'}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerCancel}
                      onClick={stopAndSend}
                      className="w-11 h-11 rounded-full bg-[#7960BC] text-white shadow-md flex items-center justify-center cursor-pointer active:scale-95"
                      title="Release or tap to send"
                    >
                      <Mic className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="pb-2 flex items-end gap-2"
            >
              {/* 48x48 Circular Liquid Glass Plus Button & Floating Menu */}
              <div className="relative shrink-0" ref={attachMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsAttachMenuOpen((prev) => !prev)}
                  className="liquid-glass-circle w-12 h-12 rounded-full flex items-center justify-center text-[#38323F] dark:text-[#F1F5F9] active:scale-90 transition-transform duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] cursor-pointer"
                  title="Attach media"
                  aria-label="Attach media"
                >
                  <Plus
                    className={`w-6 h-6 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                      isAttachMenuOpen ? 'rotate-45 text-[#9880D9]' : ''
                    }`}
                  />
                </button>

                {isAttachMenuOpen && (
                  <div className="liquid-menu-enter liquid-glass-sheet absolute bottom-full left-0 mb-2.5 w-56 p-2 rounded-2xl z-30 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAttachMenuOpen(false);
                        imageInputRef.current?.click();
                      }}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-xl hover:bg-[#9880D9]/15 text-[#38323F] dark:text-[#F1F5F9] flex items-center gap-3 text-[14px] font-medium transition-colors cursor-pointer text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#9880D9]/20 text-[#7960BC] dark:text-[#C4B5FD] flex items-center justify-center shrink-0">
                        <ImageIcon className="w-[18px] h-[18px]" />
                      </div>
                      <span>Choose from Gallery</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsAttachMenuOpen(false);
                        setIsCameraModalOpen(true);
                      }}
                      className="w-full px-3 py-2.5 min-h-[44px] rounded-xl hover:bg-[#9880D9]/15 text-[#38323F] dark:text-[#F1F5F9] flex items-center gap-3 text-[14px] font-medium transition-colors cursor-pointer text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#F472B6]/20 text-[#D4537E] dark:text-[#F9A8D4] flex items-center justify-center shrink-0">
                        <Camera className="w-[18px] h-[18px]" />
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

              {/* 50px+ Soft Translucent Liquid Glass Message Input */}
              <div className="liquid-glass-pill flex-grow min-w-0 min-h-[50px] rounded-[26px] flex items-center px-4 py-2">
                <textarea
                  ref={messageInputRef}
                  rows={1}
                  placeholder="Message"
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-transparent text-[#38323F] dark:text-white placeholder-[#93889D] dark:placeholder-[#9E90B0] text-[16px] leading-[22px] focus:outline-none resize-none max-h-[128px] py-1"
                />
              </div>

              {/* 48x48 Circular Liquid Glass Microphone / Send Control */}
              {inputText.trim() ? (
                <button
                  type="submit"
                  className="liquid-glass-send w-12 h-12 rounded-full text-white active:scale-90 transition-transform duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] flex items-center justify-center shrink-0 cursor-pointer"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send className="w-6 h-6 translate-x-[0.5px]" />
                </button>
              ) : (
                <button
                  type="button"
                  onPointerDown={handlePointerDown}
                  className="liquid-glass-gradient-btn w-12 h-12 rounded-full text-white active:scale-90 transition-transform duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] flex items-center justify-center shrink-0 touch-none select-none cursor-pointer"
                  title="Tap to record hands-free, hold to speak"
                  aria-label="Record voice message"
                >
                  <Mic className="w-6 h-6" />
                </button>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Live Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={(capturedFile) => onSendImage(capturedFile)}
      />
    </>
  );
});

export default MessageComposer;

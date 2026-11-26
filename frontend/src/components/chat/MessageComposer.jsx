import React, { useState, useEffect, useRef } from 'react';
import {
  Send, Mic, Lock, Trash2, Pause, Play, Image as ImageIcon, Camera
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
      <div className="shrink-0 border-t border-white/[0.08] bg-[#080C14]/95 pb-safe">
        <ReplyPreview
          replyingTo={replyingTo}
          currentProfileId={currentProfileId}
          onCancel={onCancelReply}
        />

        {isRecording ? (
          <div className="p-2.5 sm:p-3 md:p-4">
            {isLocked ? (
              /* Locked Hands-free Recording Bar */
              <div className="flex items-center justify-between w-full p-2 bg-slate-900/90 rounded-2xl border border-slate-700/60 shadow-xl backdrop-blur-md">
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="p-2.5 sm:p-3 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
                  title="Discard recording"
                  aria-label="Discard recording"
                >
                  <Trash2 className="w-4 sm:w-5 h-4 sm:h-5" />
                </button>

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
                <div
                  className={`absolute -top-12 right-2 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs flex items-center gap-1.5 transition-all shadow-lg ${
                    isNearLock ? 'text-pink-400 scale-105 border-pink-500/50' : 'text-slate-400'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Slide up to lock</span>
                </div>

                <div className="flex items-center gap-2 px-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse motion-reduce:animate-none" />
                  <span className="font-mono text-xs sm:text-sm font-bold text-white">
                    {formatRecordingTime(recordDuration)}
                  </span>
                </div>

                <div
                  className={`flex items-center gap-1.5 sm:gap-2 transition-all ${
                    isCanceling ? 'text-rose-400 font-semibold scale-105' : 'text-slate-400 text-[11px] sm:text-xs'
                  }`}
                >
                  <Trash2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                  <span>{isCanceling ? 'Release to cancel' : '< Slide to cancel'}</span>
                </div>

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
            onSubmit={handleSubmit}
            className="px-2.5 sm:px-3.5 py-2 flex items-end gap-1.5"
          >
            {/* Photo Attachment Menu Trigger & Popover */}
            <div className="relative shrink-0" ref={attachMenuRef}>
              <button
                type="button"
                onClick={() => setIsAttachMenuOpen((prev) => !prev)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center cursor-pointer"
                title="Attach media"
                aria-label="Attach media"
              >
                <span
                  className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                    isAttachMenuOpen
                      ? 'bg-[#6848D8]/20 border-[#6848D8]/60 text-[#9B80F8]'
                      : 'bg-[#111827] hover:bg-[#1E293B] border-white/[0.08] text-[#94A3B8] hover:text-[#F1F5F9]'
                  }`}
                >
                  <ImageIcon className="w-[18px] h-[18px]" />
                </span>
              </button>

              {isAttachMenuOpen && (
                <div className="absolute bottom-full left-0 mb-2 w-52 p-1.5 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-md z-30 flex flex-col gap-1">
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
              placeholder="Message..."
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              className="flex-grow min-w-0 px-4 py-2.5 rounded-[20px] bg-[#111827] border border-white/[0.07] text-[#F1F5F9] placeholder-[#94A3B8] text-base md:text-[15px] focus:outline-none focus:border-[#6848D8] transition-colors resize-none max-h-[120px] leading-snug my-0.5"
            />

            {inputText.trim() ? (
              <button
                type="submit"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 cursor-pointer"
                title="Send message"
                aria-label="Send message"
              >
                <span className="w-10 h-10 rounded-full bg-[#6848D8] hover:bg-[#5B3CC8] active:scale-95 text-white transition-transform flex items-center justify-center">
                  <Send className="w-[18px] h-[18px] translate-x-[0.5px]" />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={handlePointerDown}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0 touch-none select-none cursor-pointer"
                title="Tap to record hands-free, hold to speak"
                aria-label="Record voice message"
              >
                <span className="w-10 h-10 rounded-full bg-[#111827] hover:bg-[#1E293B] border border-white/[0.08] active:scale-95 active:bg-[#6848D8] text-[#94A3B8] hover:text-[#F1F5F9] transition-transform flex items-center justify-center">
                  <Mic className="w-[18px] h-[18px]" />
                </span>
              </button>
            )}
          </form>
        )}
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

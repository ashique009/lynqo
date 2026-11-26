import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, RotateCcw, Loader2 } from 'lucide-react';
import { audioPlayerManager } from '../utils/audioPlayerManager';
import { getAuthenticatedMediaUrl } from '../utils/mediaUrl';

export const VoiceMessage = React.memo(({
  message,
  isMe,
  formatTime,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [duration, setDuration] = useState(message.duration_seconds || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const audioRef = useRef(null);
  const blobUrlRef = useRef(null);
  const waveformRef = useRef(null);
  const progressOverlayRef = useRef(null);
  const timerTextRef = useRef(null);
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const messageId = message.id || message.client_message_id;

  // Generate deterministic bar heights based on message ID for waveform aesthetics
  const waveformBars = useMemo(() => {
    const seedStr = String(message.client_message_id || message.id || 'seed');
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
    }
    const barCount = 26;
    const bars = [];
    for (let i = 0; i < barCount; i++) {
      const pseudo = Math.abs(Math.sin(hash + i * 1.618));
      // Height between 20% and 95%
      bars.push(Math.round(20 + pseudo * 75));
    }
    return bars;
  }, [message.id, message.client_message_id]);

  // Clean up audio element on unmount; mediaUrl.js owns cached Blob URL lifecycle
  useEffect(() => {
    return () => {
      audioPlayerManager.stop(messageId);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      blobUrlRef.current = null;
    };
  }, [messageId]);

  // Reset local ref if message.audio_url transitions (e.g. optimistic blob -> server URL)
  useEffect(() => {
    blobUrlRef.current = null;
  }, [message.audio_url]);

  const formatTimer = useCallback((sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }, []);

  const updateProgressDom = useCallback((timeSec, totalSec) => {
    const pct = totalSec > 0 ? Math.max(0, Math.min(100, (timeSec / totalSec) * 100)) : 0;
    if (progressOverlayRef.current) {
      progressOverlayRef.current.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    }
    if (timerTextRef.current) {
      timerTextRef.current.textContent = formatTimer(timeSec > 0 ? timeSec : totalSec);
    }
  }, [formatTimer]);

  // Pause this audio callback for audioPlayerManager
  const pauseSelf = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  // Resolve audio source (handles direct local Blob URL for optimistic message, or fetches authenticated media)
  const getAudioSource = useCallback(async () => {
    if (blobUrlRef.current) {
      return blobUrlRef.current;
    }

    if (!message.audio_url) {
      throw new Error('Audio URL not available.');
    }

    // If it's already a local blob URL (optimistic sending)
    if (message.audio_url.startsWith('blob:') || message.audio_url.startsWith('data:')) {
      blobUrlRef.current = message.audio_url;
      return message.audio_url;
    }

    // Fetch through authenticated API client or cache (owned by mediaUrl.js)
    const objectUrl = await getAuthenticatedMediaUrl(message.audio_url);
    if (!objectUrl) {
      throw new Error('Failed to load authenticated audio.');
    }
    blobUrlRef.current = objectUrl;
    return objectUrl;
  }, [message.audio_url]);

  const initAudio = useCallback(async () => {
    if (audioRef.current) return audioRef.current;

    setIsLoading(true);
    setHasError(false);

    try {
      const src = await getAudioSource();
      const audio = new Audio(src);
      audio.playbackRate = playbackSpeed;
      audio.preload = 'auto';

      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setDuration(audio.duration);
        }
      };

      audio.ontimeupdate = () => {
        const dur = audio.duration && isFinite(audio.duration) ? audio.duration : durationRef.current;
        updateProgressDom(audio.currentTime, dur);
      };

      audio.onended = () => {
        setIsPlaying(false);
        updateProgressDom(0, durationRef.current);
        audioPlayerManager.stop(messageId);
      };

      audio.onerror = (e) => {
        console.warn('Audio element error:', e);
        if (audioRef.current) {
          try {
            audioRef.current.pause();
            audioRef.current.src = '';
          } catch (err) {}
          audioRef.current = null;
        }
        setHasError(true);
        setIsLoading(false);
        setIsPlaying(false);
        audioPlayerManager.stop(messageId);
      };

      audioRef.current = audio;
      setIsLoading(false);
      return audio;
    } catch (err) {
      setHasError(true);
      setIsLoading(false);
      throw err;
    }
  }, [getAudioSource, playbackSpeed, messageId]);

  const togglePlayPause = async () => {
    if (isLoading) return;

    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
      audioPlayerManager.stop(messageId);
      return;
    }

    try {
      let audio = audioRef.current;
      if (!audio) {
        audio = await initAudio();
      }

      // If finished, reset to beginning before replay
      if (audio.currentTime >= duration || audio.ended) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }

      // Notify manager to pause any other currently playing message
      audioPlayerManager.play(messageId, pauseSelf);

      await audio.play();
      setIsPlaying(true);
      setHasError(false);
    } catch (err) {
      console.error('Failed to play voice message:', err);
      if (audioRef.current) {
        try {
          audioRef.current.pause();
          audioRef.current.src = '';
        } catch (e) {}
        audioRef.current = null;
      }
      setHasError(true);
      setIsPlaying(false);
    }
  };

  const handleSeek = (e) => {
    if (!waveformRef.current || !duration) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, clickX / rect.width));
    const targetTime = percent * duration;

    updateProgressDom(targetTime, duration);
    if (audioRef.current) {
      audioRef.current.currentTime = targetTime;
    }
  };

  const cycleSpeed = (e) => {
    e.stopPropagation();
    const speeds = [1, 1.5, 2];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    const nextSpeed = speeds[nextIdx];
    setPlaybackSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  return (
    <div className="flex flex-col gap-1 w-full min-w-[190px] max-w-[270px] select-none">
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Play / Pause / Retry Button */}
        {hasError ? (
          <button
            onClick={togglePlayPause}
            className="w-10 h-10 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center justify-center shrink-0 transition-all cursor-pointer"
            title="Retry playback"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={togglePlayPause}
            disabled={isLoading || message.status === 'sending'}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
              isMe
                ? 'bg-white/95 text-[#7C5CFA] hover:bg-white disabled:opacity-50 shadow-sm'
                : 'liquid-glass-gradient-btn text-white hover:opacity-95 disabled:opacity-50'
            }`}
            aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 ml-0.5 fill-current" />
            )}
          </button>
        )}

        {/* Waveform Visualization (GPU-clipped progress overlay; zero React re-renders during playback) */}
        <div className="flex-grow flex flex-col gap-1">
          <div
            ref={waveformRef}
            onClick={handleSeek}
            className="h-8 cursor-pointer py-1 relative"
            role="slider"
            aria-label="Seek voice message"
            aria-valuemin={0}
            aria-valuemax={duration}
          >
            <div className="h-full flex items-center gap-[2.5px]">
              {waveformBars.map((heightPercent, idx) => (
                <div
                  key={idx}
                  style={{ height: `${heightPercent}%` }}
                  className={`flex-1 rounded-full ${
                    isMe ? 'bg-white/35' : 'bg-white/40'
                  }`}
                />
              ))}
            </div>
            <div
              ref={progressOverlayRef}
              style={{ clipPath: 'inset(0 100% 0 0)' }}
              className="absolute inset-0 py-1 flex items-center gap-[2.5px] pointer-events-none"
            >
              {waveformBars.map((heightPercent, idx) => (
                <div
                  key={idx}
                  style={{ height: `${heightPercent}%` }}
                  className="flex-1 rounded-full bg-white"
                />
              ))}
            </div>
          </div>

          {/* Time & Speed Controls */}
          <div className="flex items-center justify-between text-[12px] font-mono tabular-nums leading-none">
            <span ref={timerTextRef} className="text-white/90">
              {formatTimer(duration)}
            </span>

            <button
              onClick={cycleSpeed}
              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-sans transition-colors cursor-pointer bg-white/15 hover:bg-white/25 text-white border border-white/15"
              title="Change playback speed"
            >
              {playbackSpeed}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default VoiceMessage;

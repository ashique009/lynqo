import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause, RotateCcw, Loader2 } from 'lucide-react';
import { audioPlayerManager } from '../utils/audioPlayerManager';
import client, { API_BASE_URL } from '../api/client';

export const VoiceMessage = ({
  message,
  isMe,
  formatTime,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(message.duration_seconds || 0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const audioRef = useRef(null);
  const blobUrlRef = useRef(null);
  const waveformRef = useRef(null);
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

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      audioPlayerManager.stop(messageId);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
      if (blobUrlRef.current && blobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [messageId]);

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
    if (message.audio_url.startsWith('blob:')) {
      blobUrlRef.current = message.audio_url;
      return message.audio_url;
    }

    // Fetch through authenticated API client to attach auth headers
    const url = message.audio_url.startsWith('http')
      ? message.audio_url
      : `${API_BASE_URL || ''}${message.audio_url}`;

    try {
      const response = await client.get(url, { responseType: 'blob' });
      const blob = response instanceof Blob ? response : new Blob([response]);
      const objectUrl = URL.createObjectURL(blob);
      blobUrlRef.current = objectUrl;
      return objectUrl;
    } catch (err) {
      // Fallback to direct URL if blob fetch fails
      return url;
    }
  }, [message.audio_url]);

  const initAudio = useCallback(async () => {
    if (audioRef.current) return audioRef.current;

    setIsLoading(true);
    setHasError(false);

    try {
      const src = await getAudioSource();
      const audio = new Audio(src);
      audio.playbackRate = playbackSpeed;

      audio.onloadedmetadata = () => {
        if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
          setDuration(audio.duration);
        }
      };

      audio.ontimeupdate = () => {
        setCurrentTime(audio.currentTime);
      };

      audio.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        audioPlayerManager.stop(messageId);
      };

      audio.onerror = () => {
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

      // Notify manager to pause any other currently playing message
      audioPlayerManager.play(messageId, pauseSelf);

      await audio.play();
      setIsPlaying(true);
      setHasError(false);
    } catch (err) {
      console.error('Failed to play voice message:', err);
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

    setCurrentTime(targetTime);
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

  const formatTimer = (sec) => {
    if (!sec || isNaN(sec)) return '0:00';
    const total = Math.floor(sec);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-1 w-64 sm:w-72 select-none">
      <div className="flex items-center gap-3">
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
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all shadow-md cursor-pointer ${
              isMe
                ? 'bg-white text-indigo-600 hover:bg-slate-100 disabled:opacity-50'
                : 'bg-gradient-to-r from-pink-500 to-indigo-600 text-white hover:opacity-90 disabled:opacity-50'
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

        {/* Waveform Visualization */}
        <div className="flex-grow flex flex-col gap-1">
          <div
            ref={waveformRef}
            onClick={handleSeek}
            className="h-8 flex items-center gap-[2.5px] cursor-pointer py-1 relative"
            role="slider"
            aria-label="Seek voice message"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
          >
            {waveformBars.map((heightPercent, idx) => {
              const barPercent = (idx / waveformBars.length) * 100;
              const isPlayed = barPercent <= progressPercent;
              return (
                <div
                  key={idx}
                  style={{ height: `${heightPercent}%` }}
                  className={`flex-1 rounded-full transition-colors duration-75 ${
                    isPlayed
                      ? isMe
                        ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'
                        : 'bg-pink-400'
                      : isMe
                      ? 'bg-white/30'
                      : 'bg-slate-600'
                  }`}
                />
              );
            })}
          </div>

          {/* Time & Speed Controls */}
          <div className="flex items-center justify-between text-[11px] font-mono leading-none">
            <span className={isMe ? 'text-white/80' : 'text-slate-400'}>
              {isPlaying ? formatTimer(currentTime) : formatTimer(duration)}
            </span>

            <button
              onClick={cycleSpeed}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-sans transition-colors cursor-pointer ${
                isMe
                  ? 'bg-white/20 hover:bg-white/30 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
              }`}
              title="Change playback speed"
            >
              {playbackSpeed}x
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceMessage;

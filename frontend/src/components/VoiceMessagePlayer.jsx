import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause } from 'lucide-react';
import { API_BASE_URL } from '../api/client';

const barHeights = [
  30, 50, 40, 80, 60, 25, 70, 90, 45, 30, 55, 75, 60, 40, 85, 95, 50, 30, 65, 80, 45, 30, 55, 70, 40, 30, 20, 45, 60, 30
];

const formatDuration = (seconds) => {
  if (isNaN(seconds) || seconds === Infinity || seconds === null || seconds === undefined) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export const VoiceMessagePlayer = ({ audioUrl, duration, isMe }) => {
  const audioRef = useRef(null);
  const waveformRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);

  // Resolve backend relative URLs or blob URLs
  const getFullAudioUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
      return url;
    }
    const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${baseUrl}${path}`;
  };

  const resolvedUrl = getFullAudioUrl(audioUrl);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
  }, [resolvedUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setAudioDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [resolvedUrl]);

  const togglePlay = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      // Pause all other audio elements on the page first
      document.querySelectorAll('audio').forEach((el) => {
        if (el !== audio) {
          el.pause();
        }
      });
      
      audio.play().catch(err => {
        console.error("Playback failed:", err);
      });
    }
  };

  const handleWaveformClick = (e) => {
    e.stopPropagation();
    const audio = audioRef.current;
    const waveform = waveformRef.current;
    if (!audio || !waveform || !audioDuration) return;

    const rect = waveform.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    audio.currentTime = progress * audioDuration;
    setCurrentTime(progress * audioDuration);
  };

  const progress = audioDuration > 0 ? currentTime / audioDuration : 0;

  return (
    <div className="flex items-center gap-3 py-1.5 select-none w-full max-w-[280px] sm:max-w-[320px]">
      <audio ref={audioRef} src={resolvedUrl} preload="metadata" />

      {/* Circular Play/Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 cursor-pointer shadow-sm transition-all duration-200 active:scale-95 ${
          isMe
            ? 'bg-white text-[#D4537E] hover:bg-pink-50'
            : 'bg-[#D4537E] dark:bg-brand-purple text-white hover:bg-[#c2436d] dark:hover:bg-brand-purple-dark border border-transparent dark:border-brand-purple-light/10'
        }`}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform and Time Label Container */}
      <div className="flex flex-col flex-grow gap-1">
        {/* Waveform */}
        <div
          ref={waveformRef}
          onClick={handleWaveformClick}
          className="h-6 flex items-center gap-[2.5px] cursor-pointer w-full relative"
        >
          {barHeights.map((heightPercent, idx) => {
            const barProgressThreshold = idx / barHeights.length;
            const isPlayed = progress >= barProgressThreshold;
            return (
              <div
                key={idx}
                className="w-[2.5px] rounded-full transition-colors duration-150"
                style={{
                  height: `${heightPercent}%`,
                  backgroundColor: isMe
                    ? isPlayed
                      ? '#FFFFFF'
                      : 'rgba(255, 255, 255, 0.4)'
                    : isPlayed
                      ? '#D4537E'
                      : 'rgba(212, 83, 126, 0.25)'
                }}
              />
            );
          })}
        </div>

        {/* Duration Label */}
        <div className="flex justify-between items-center text-[10px] font-semibold">
          <span className={isMe ? 'text-pink-100/90' : 'text-[#5F5E5A] dark:text-slate-500'}>
            {formatDuration(isPlaying ? currentTime : audioDuration)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VoiceMessagePlayer;

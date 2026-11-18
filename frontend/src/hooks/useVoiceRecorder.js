import { useState, useRef, useEffect, useCallback } from 'react';

export const getSupportedMimeType = () => {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    return 'audio/webm';
  }
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/aac',
    'audio/wav',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
};

export const useVoiceRecorder = ({ onSend, maxDuration = 120, onError }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevels, setAudioLevels] = useState([0.2, 0.4, 0.6, 0.3, 0.5, 0.8, 0.4]);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isNearLock, setIsNearLock] = useState(false);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(0);
  const pausedDurationRef = useRef(0);
  const pauseStartRef = useRef(0);
  const pointerStartRef = useRef({ x: 0, y: 0, time: 0 });
  const isHoldingRef = useRef(false);
  const isLockedRef = useRef(false);
  isLockedRef.current = isLocked;

  // Cleanup helper
  const cleanup = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {
        // ignore
      }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          // ignore
        }
      });
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    isHoldingRef.current = false;
    setIsRecording(false);
    setIsLocked(false);
    setIsPaused(false);
    setIsCanceling(false);
    setIsNearLock(false);
    setDuration(0);
  }, []);

  // Stop recording and send
  const stopAndSend = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      return;
    }

    const currentDuration = duration;
    if (currentDuration < 0.6) {
      // Too short
      cleanup();
      onError?.('Voice message too short');
      return;
    }

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || getSupportedMimeType() || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size > 0 && currentDuration >= 0.5) {
        onSend(blob, currentDuration);
      }
      cleanup();
    };

    try {
      recorder.stop();
    } catch (e) {
      cleanup();
    }
  }, [duration, onSend, onError, cleanup]);

  // Cancel recording and discard
  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      try {
        recorder.stop();
      } catch (e) {
        // ignore
      }
    }
    cleanup();
  }, [cleanup]);

  // Start recording
  const startRecording = useCallback(async (locked = false) => {
    if (isRecording || mediaRecorderRef.current) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onError?.('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      // Set up Web Audio Analyser for live visualizer
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          const audioCtx = new AudioContextClass();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateLevels = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            // Sample 7 frequency bands
            const sampleCount = 7;
            const step = Math.floor(dataArray.length / sampleCount) || 1;
            const levels = [];
            for (let i = 0; i < sampleCount; i++) {
              const val = (dataArray[i * step] || 0) / 255;
              // Normalized minimum bar height 0.15
              levels.push(Math.max(0.15, val));
            }
            setAudioLevels(levels);
            animFrameRef.current = requestAnimationFrame(updateLevels);
          };
          updateLevels();
        }
      } catch (e) {
        console.warn('Web Audio visualization error:', e);
      }

      mediaRecorder.start(200); // 200ms timeslices for smooth capture
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;
      setIsRecording(true);
      setIsLocked(locked);
      setIsPaused(false);
      setDuration(0);

      // Duration interval
      timerRef.current = setInterval(() => {
        if (isPaused) return;
        const totalElapsed = (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000;
        setDuration(totalElapsed);

        // Auto-stop at max duration
        if (totalElapsed >= maxDuration) {
          stopAndSend();
        }
      }, 100);
    } catch (err) {
      cleanup();
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        onError?.('Microphone access denied. Please allow microphone permission in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        onError?.('No microphone found on your device.');
      } else {
        onError?.(err.message || 'Could not start audio recording.');
      }
    }
  }, [isRecording, maxDuration, isPaused, stopAndSend, onError, cleanup]);

  // Pause recording (locked mode)
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      pauseStartRef.current = Date.now();
      setIsPaused(true);
    }
  }, []);

  // Resume recording (locked mode)
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      pausedDurationRef.current += Date.now() - pauseStartRef.current;
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  // Pointer event handlers for hold-to-record, swipe-to-cancel, slide-to-lock
  const handlePointerDown = useCallback((e) => {
    // Only primary button
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    isHoldingRef.current = true;
    pointerStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      time: Date.now(),
    };
    setIsCanceling(false);
    setIsNearLock(false);
    startRecording(false);
  }, [startRecording]);

  const handlePointerMove = useCallback((e) => {
    if (!isHoldingRef.current || isLockedRef.current) return;
    const deltaX = e.clientX - pointerStartRef.current.x;
    const deltaY = e.clientY - pointerStartRef.current.y;

    // Swipe left to cancel threshold: 60px
    const canceling = deltaX < -50;
    setIsCanceling(canceling);

    // Slide up to lock threshold: 60px
    const nearLock = deltaY < -40;
    const lockConfirmed = deltaY < -70;

    setIsNearLock(nearLock);

    if (lockConfirmed) {
      isHoldingRef.current = false;
      setIsLocked(true);
      setIsNearLock(false);
    }
  }, []);

  const handlePointerUp = useCallback((e) => {
    if (!isHoldingRef.current || isLockedRef.current) return;
    isHoldingRef.current = false;

    const tapDuration = Date.now() - pointerStartRef.current.time;
    const deltaX = e.clientX - pointerStartRef.current.x;

    if (deltaX < -50) {
      // Swiped left to cancel
      cancelRecording();
      return;
    }

    if (tapDuration < 250) {
      // Quick tap without hold: switch to locked recording mode for accessibility
      setIsLocked(true);
      return;
    }

    // Normal release to send
    stopAndSend();
  }, [cancelRecording, stopAndSend]);

  const handlePointerCancel = useCallback(() => {
    if (isHoldingRef.current && !isLockedRef.current) {
      cancelRecording();
    }
  }, [cancelRecording]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isRecording,
    isLocked,
    isPaused,
    duration,
    audioLevels,
    isCanceling,
    isNearLock,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopAndSend,
    cancelRecording,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
};

export default useVoiceRecorder;

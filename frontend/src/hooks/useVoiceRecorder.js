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
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

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
  const isFinalizingRef = useRef(false);
  const previewAudioRef = useRef(null);
  const previewUrlRef = useRef(null);

  isLockedRef.current = isLocked;

  // Cleanup helper
  const cleanup = useCallback(() => {
    isFinalizingRef.current = false;
    isHoldingRef.current = false;
    setIsRecording(false);
    setIsLocked(false);
    setIsPaused(false);
    setIsCanceling(false);
    setIsNearLock(false);
    setDuration(0);
    setIsPlayingPreview(false);

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (previewAudioRef.current) {
      try {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      } catch (e) {
        // ignore
      }
      previewAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      try {
        URL.revokeObjectURL(previewUrlRef.current);
      } catch (e) {
        // ignore
      }
      previewUrlRef.current = null;
      setPreviewUrl(null);
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
  }, []);

  // Stop recording and send
  const stopAndSend = useCallback(async () => {
    if (isFinalizingRef.current) return;

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanup();
      return;
    }

    isFinalizingRef.current = true;

    // Use monotonic wall-clock calculation to prevent React state lag
    const now = Date.now();
    let totalElapsed = (now - startTimeRef.current - pausedDurationRef.current) / 1000;
    if (pauseStartRef.current > 0 && recorder.state === 'paused') {
      // currently paused, subtract recent pause time
      totalElapsed -= (now - pauseStartRef.current) / 1000;
    }

    if (totalElapsed < 0.5) {
      cleanup();
      onError?.('Voice message too short. Tap to record hands-free.');
      return;
    }

    // Flush final audio slice before stopping
    try {
      if (recorder.state === 'recording' || recorder.state === 'paused') {
        recorder.requestData();
      }
    } catch (e) {
      // ignore
    }

    recorder.onstop = () => {
      try {
        const mimeType = recorder.mimeType || getSupportedMimeType() || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > 0 && totalElapsed >= 0.4) {
          onSend(blob, Math.max(1, totalElapsed));
        } else {
          onError?.('Could not capture audio recording. Please try again.');
        }
      } catch (err) {
        onError?.('Error processing voice recording.');
      } finally {
        cleanup();
      }
    };

    try {
      recorder.stop();
    } catch (e) {
      cleanup();
    }

    // Safety timeout: ensure cleanup runs even if recorder fails to fire onstop
    setTimeout(() => {
      if (isFinalizingRef.current) {
        cleanup();
      }
    }, 1200);
  }, [cleanup, onSend, onError]);

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

      // Web Audio Analyser for live visualizer
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
            const sampleCount = 7;
            const step = Math.floor(dataArray.length / sampleCount) || 1;
            const levels = [];
            for (let i = 0; i < sampleCount; i++) {
              const val = (dataArray[i * step] || 0) / 255;
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
      pauseStartRef.current = 0;
      isFinalizingRef.current = false;
      setIsRecording(true);
      setIsLocked(locked);
      setIsPaused(false);
      setDuration(0);

      // Duration interval timer
      timerRef.current = setInterval(() => {
        if (isPaused) return;
        const totalElapsed = (Date.now() - startTimeRef.current - pausedDurationRef.current) / 1000;
        setDuration(totalElapsed);

        // Auto-stop when reaching max duration
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
      try {
        mediaRecorderRef.current.requestData();
      } catch (e) {
        // ignore
      }
      mediaRecorderRef.current.pause();
      pauseStartRef.current = Date.now();
      setIsPaused(true);

      // Generate preview blob URL when pausing so user can review
      const mimeType = mediaRecorderRef.current?.mimeType || getSupportedMimeType() || 'audio/webm';
      if (chunksRef.current.length > 0) {
        const previewBlob = new Blob(chunksRef.current, { type: mimeType });
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(previewBlob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      }
    }
  }, []);

  // Resume recording (locked mode)
  const resumeRecording = useCallback(() => {
    // Stop any active preview playback
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
      setPreviewUrl(null);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      pausedDurationRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  // Toggle preview playback
  const togglePreview = useCallback(() => {
    if (!previewUrlRef.current) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        pauseRecording();
      }
      return;
    }

    if (isPlayingPreview && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setIsPlayingPreview(false);
      return;
    }

    if (!previewAudioRef.current) {
      const audio = new Audio(previewUrlRef.current);
      previewAudioRef.current = audio;
      audio.onended = () => setIsPlayingPreview(false);
      audio.onerror = () => setIsPlayingPreview(false);
    }

    previewAudioRef.current.play().then(() => {
      setIsPlayingPreview(true);
    }).catch(() => {
      setIsPlayingPreview(false);
    });
  }, [isPlayingPreview, pauseRecording]);

  // Robust pointer event handling:
  // Tracks gesture via window listeners so events are never lost if finger/mouse moves
  const handlePointerDown = useCallback((e) => {
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

    // Start recording immediately
    startRecording(false);

    // Attach window listeners to reliably track movement and release anywhere on screen
    const onWindowMove = (moveEvt) => {
      if (!isHoldingRef.current || isLockedRef.current) return;
      const deltaX = moveEvt.clientX - pointerStartRef.current.x;
      const deltaY = moveEvt.clientY - pointerStartRef.current.y;

      // Swipe left threshold: -50px
      const canceling = deltaX < -50;
      setIsCanceling(canceling);

      // Slide up to lock: -35px near, -65px locked
      const nearLock = deltaY < -35;
      const lockConfirmed = deltaY < -65;
      setIsNearLock(nearLock);

      if (lockConfirmed) {
        isHoldingRef.current = false;
        setIsLocked(true);
        setIsNearLock(false);
        removeWindowListeners();
      }
    };

    const onWindowUp = (upEvt) => {
      removeWindowListeners();
      if (!isHoldingRef.current || isLockedRef.current) return;
      isHoldingRef.current = false;

      const tapDuration = Date.now() - pointerStartRef.current.time;
      const deltaX = upEvt.clientX - pointerStartRef.current.x;

      if (deltaX < -50) {
        // Swiped left to cancel
        cancelRecording();
        return;
      }

      if (tapDuration < 320) {
        // Tapped or clicked without holding: switch smoothly to locked hands-free recording!
        // This gives the user clear Send, Pause, and Trash controls.
        setIsLocked(true);
        return;
      }

      // Normal release after holding: send immediately
      stopAndSend();
    };

    const onWindowCancel = () => {
      removeWindowListeners();
      if (isHoldingRef.current && !isLockedRef.current) {
        isHoldingRef.current = false;
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        // If user already spoke for > 1.0s, lock instead of deleting to prevent losing recording
        if (elapsed >= 1.0) {
          setIsLocked(true);
        } else {
          cancelRecording();
        }
      }
    };

    const removeWindowListeners = () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowCancel);
    };

    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowCancel);
  }, [startRecording, cancelRecording, stopAndSend]);

  const handlePointerMove = useCallback(() => {}, []);
  const handlePointerUp = useCallback(() => {}, []);
  const handlePointerCancel = useCallback(() => {}, []);

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
    previewUrl,
    isPlayingPreview,
    startRecording,
    pauseRecording,
    resumeRecording,
    togglePreview,
    stopAndSend,
    cancelRecording,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
  };
};

export default useVoiceRecorder;

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Send, FlipHorizontal, AlertCircle, Image as ImageIcon } from 'lucide-react';

export const CameraCaptureModal = ({ isOpen, onClose, onCapture }) => {
  const [stream, setStream] = useState(null);
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState(null);
  const [facingMode, setFacingMode] = useState('environment'); // default to rear camera on mobile
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fallbackInputRef = useRef(null);

  // Stop all active camera tracks
  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      } catch (e) {
        // ignore
      }
      streamRef.current = null;
    }
    setStream(null);
  }, []);

  // Check if device has multiple video cameras (e.g. front + back)
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      setHasMultipleCameras(videoDevices.length > 1);
    }).catch(() => {});
  }, []);

  // Start camera stream
  const startCamera = useCallback(async (mode = facingMode) => {
    stopTracks();
    setErrorMsg(null);
    setIsLoadingCamera(true);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMsg('Camera access is not supported by your browser.');
      setIsLoadingCamera(false);
      return;
    }

    try {
      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = mediaStream;
      setStream(mediaStream);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('getUserMedia failed with ideal mode:', err);
      // Fallback try with basic constraints
      try {
        const basicStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = basicStream;
        setStream(basicStream);
        if (videoRef.current) {
          videoRef.current.srcObject = basicStream;
          videoRef.current.play().catch(() => {});
        }
      } catch (fallbackErr) {
        let msg = 'Could not access camera.';
        if (fallbackErr.name === 'NotAllowedError' || fallbackErr.name === 'PermissionDeniedError') {
          msg = 'Camera permission was denied. Please allow camera access in your browser settings.';
        } else if (fallbackErr.name === 'NotFoundError' || fallbackErr.name === 'DevicesNotFoundError') {
          msg = 'No camera found on this device.';
        } else if (fallbackErr.name === 'NotReadableError' || fallbackErr.name === 'TrackStartError') {
          msg = 'Camera is already in use by another application.';
        }
        setErrorMsg(msg);
      }
    } finally {
      setIsLoadingCamera(false);
    }
  }, [facingMode, stopTracks]);

  // Handle open / close lifecycle
  useEffect(() => {
    if (isOpen) {
      setCapturedBlob(null);
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
        setCapturedPreviewUrl(null);
      }
      startCamera();
    } else {
      stopTracks();
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
        setCapturedPreviewUrl(null);
      }
      setCapturedBlob(null);
      setErrorMsg(null);
    }

    return () => {
      stopTracks();
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
  }, [isOpen]);

  // Flip between front & back cameras
  const toggleCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  // Capture current video frame to JPEG blob
  const handleCapturePhoto = () => {
    const video = videoRef.current;
    if (!video || !streamRef.current) return;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');

      // Mirror preview if front-facing camera
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) {
          setErrorMsg('Failed to process captured image.');
          return;
        }
        stopTracks(); // Turn off camera light immediately on capture
        setCapturedBlob(blob);
        const url = URL.createObjectURL(blob);
        setCapturedPreviewUrl(url);
      }, 'image/jpeg', 0.92);
    } catch (err) {
      console.error('Error capturing photo:', err);
      setErrorMsg('Error capturing photo. Please try again.');
    }
  };

  // Retake photo
  const handleRetake = () => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
      setCapturedPreviewUrl(null);
    }
    setCapturedBlob(null);
    startCamera();
  };

  // Confirm and send captured photo
  const handleSendPhoto = () => {
    if (!capturedBlob) return;
    const file = new File(
      [capturedBlob],
      `photo_${Date.now()}.jpg`,
      { type: 'image/jpeg' }
    );
    stopTracks();
    onCapture(file);
    onClose();
  };

  // System camera fallback handler
  const handleFallbackFileSelect = (e) => {
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      stopTracks();
      onCapture(file);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between select-none animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Hidden fallback input */}
      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFallbackFileSelect}
        className="hidden"
      />

      {/* Top Controls Bar */}
      <div
        className="px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-10 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5 text-pink-400" />
          <span className="font-bold text-sm text-white">
            {capturedBlob ? 'Review Photo' : 'Take Photo'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {!capturedBlob && hasMultipleCameras && (
            <button
              type="button"
              onClick={toggleCamera}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Switch camera"
            >
              <FlipHorizontal className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-colors cursor-pointer ml-1"
            title="Close camera"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Viewport: Video Preview or Frozen Capture */}
      <div
        className="flex-grow flex items-center justify-center p-2 sm:p-6 overflow-hidden relative cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {errorMsg ? (
          <div className="max-w-md p-6 rounded-2xl bg-slate-900/90 border border-slate-800 text-center flex flex-col items-center gap-3">
            <AlertCircle className="w-10 h-10 text-rose-400" />
            <h3 className="font-bold text-white text-base">Camera Unavailable</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{errorMsg}</p>
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-600 text-white font-semibold text-xs flex items-center gap-2 shadow-lg hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Use Device Camera</span>
              </button>
              <button
                type="button"
                onClick={() => startCamera()}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          </div>
        ) : capturedPreviewUrl ? (
          <div className="relative max-h-[80vh] max-w-[92vw] overflow-hidden rounded-2xl shadow-2xl border border-white/10">
            <img
              src={capturedPreviewUrl}
              alt="Captured preview"
              className="max-h-[80vh] max-w-[92vw] object-contain rounded-2xl"
            />
          </div>
        ) : (
          <div className="relative w-full max-w-xl h-full max-h-[75vh] flex items-center justify-center bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10">
            {isLoadingCamera && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/80 z-10">
                <RefreshCw className="w-8 h-8 text-pink-400 animate-spin" />
                <span className="text-xs text-slate-400">Starting camera...</span>
              </div>
            )}
            <video
              ref={videoRef}
              playsInline
              autoPlay
              muted
              className={`w-full h-full object-cover rounded-2xl ${
                facingMode === 'user' ? '-scale-x-100' : ''
              }`}
            />
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div
        className="px-4 py-4 sm:px-6 sm:py-6 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-6 z-10 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {capturedBlob ? (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleRetake}
              className="px-5 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-md transition-all cursor-pointer border border-white/10"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retake</span>
            </button>
            <button
              type="button"
              onClick={handleSendPhoto}
              className="px-6 py-2.5 rounded-full bg-gradient-to-r from-pink-500 to-indigo-600 hover:from-pink-600 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-pink-500/25 transition-all cursor-pointer"
            >
              <span>Send Photo</span>
              <Send className="w-4 h-4" />
            </button>
          </div>
        ) : !errorMsg ? (
          <div className="flex items-center gap-8">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {/* Shutter Button */}
            <button
              type="button"
              onClick={handleCapturePhoto}
              disabled={isLoadingCamera || !stream}
              className="w-18 h-18 sm:w-20 sm:h-20 rounded-full border-4 border-white/80 p-1 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
              title="Capture photo"
              aria-label="Capture photo"
            >
              <div className="w-full h-full rounded-full bg-white active:bg-pink-400 transition-colors shadow-inner" />
            </button>

            {hasMultipleCameras ? (
              <button
                type="button"
                onClick={toggleCamera}
                className="p-3 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Switch camera"
              >
                <FlipHorizontal className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-11" />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default CameraCaptureModal;

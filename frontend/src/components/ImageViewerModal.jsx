import React, { useState, useEffect } from 'react';
import { X, Download, ZoomIn, ZoomOut, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import { getAuthenticatedMediaUrl } from '../utils/mediaUrl';
import client, { isExternalUrl } from '../api/client';

export const ImageViewerModal = ({ message, onClose }) => {
  const [zoom, setZoom] = useState(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const rawUrl = message?.image_url || message?.thumbnail_url || message?.local_preview_url;
  const [fullSrc, setFullSrc] = useState(() => {
    return rawUrl && (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) ? rawUrl : null;
  });

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let isMounted = true;
    if (!rawUrl) {
      setHasError(true);
      return;
    }

    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
      setFullSrc(rawUrl);
      setIsLoaded(true);
      return;
    }

    setHasError(false);
    setIsLoaded(false);

    getAuthenticatedMediaUrl(rawUrl)
      .then((url) => {
        if (isMounted) {
          if (url) {
            setFullSrc(url);
            setHasError(false);
          } else {
            setHasError(true);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setHasError(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [rawUrl]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.5, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.5, 0.5));
  const handleResetZoom = () => setZoom(1);

  const handleDownload = async () => {
    if (!fullSrc) return;
    setDownloading(true);
    try {
      let downloadBlob;
      if (fullSrc.startsWith('blob:')) {
        const resp = await fetch(fullSrc);
        downloadBlob = await resp.blob();
      } else if (isExternalUrl(fullSrc)) {
        const resp = await fetch(fullSrc, { credentials: 'omit', mode: 'cors' });
        downloadBlob = await resp.blob();
      } else {
        const resp = await client.get(fullSrc, { responseType: 'blob' });
        downloadBlob = resp instanceof Blob ? resp : new Blob([resp]);
      }
      const blobUrl = URL.createObjectURL(downloadBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `lynqo_photo_${message.id || Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (err) {
      console.error('Download failed, falling back to window.open:', err);
      window.open(fullSrc, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  if (!message) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col justify-between animate-in fade-in duration-150 select-none"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="px-4 py-3 sm:px-6 sm:py-4 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-10 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-white">{message.sender_display_name || 'Photo'}</span>
          <span className="text-xs text-slate-400">
            {message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Reset Zoom"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* Download button */}
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || !fullSrc}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
            title="Download image"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin text-pink-400" /> : <Download className="w-4 h-4" />}
          </button>

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-colors cursor-pointer ml-1"
            title="Close viewer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image View */}
      <div
        className="flex-grow flex items-center justify-center p-2 sm:p-6 overflow-hidden relative cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {!isLoaded && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-pink-400" />
          </div>
        )}

        {hasError ? (
          <div className="flex flex-col items-center justify-center gap-2 text-rose-300 p-4 text-center">
            <AlertCircle className="w-8 h-8 text-rose-400" />
            <span className="text-sm font-semibold">Failed to load high-resolution photo</span>
            <button
              type="button"
              onClick={() => {
                setHasError(false);
                setIsLoaded(false);
                if (rawUrl) {
                  getAuthenticatedMediaUrl(rawUrl).then((url) => {
                    if (url) {
                      setFullSrc(url);
                      setHasError(false);
                    } else {
                      setHasError(true);
                    }
                  }).catch(() => setHasError(true));
                }
              }}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-white text-xs font-semibold cursor-pointer transition-colors"
            >
              Retry
            </button>
          </div>
        ) : fullSrc ? (
          <img
            src={fullSrc}
            alt="Full resolution view"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setHasError(true);
              setIsLoaded(true);
            }}
            style={{
              transform: `scale(${zoom})`,
              transition: 'transform 0.15s ease-out',
              maxHeight: '85vh',
              maxWidth: '92vw',
            }}
            className={`object-contain rounded-lg shadow-2xl transition-opacity duration-200 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : null}
      </div>

      {/* Bottom info bar */}
      <div
        className="px-4 py-2 sm:px-6 sm:py-3 bg-gradient-to-t from-black/80 to-transparent text-center text-xs text-slate-400 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span>LYNQO Private Photo &middot; Tap image or press ESC to exit</span>
      </div>
    </div>
  );
};

export default ImageViewerModal;

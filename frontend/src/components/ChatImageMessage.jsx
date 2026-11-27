import React, { useState, useEffect } from 'react';
import { Loader2, RefreshCw, ZoomIn, AlertCircle } from 'lucide-react';
import { getAuthenticatedMediaUrl, acquireMediaUrl, releaseMediaUrl } from '../utils/mediaUrl';

export const ChatImageMessage = React.memo(({
  message,
  isMe,
  onImageClick,
  onRetry,
}) => {
  const rawUrl = message.thumbnail_url || message.image_url || message.local_preview_url;
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    return rawUrl && (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) ? rawUrl : null;
  });
  const [isLoaded, setIsLoaded] = useState(() => {
    return Boolean(rawUrl && rawUrl.startsWith('blob:') && message.status === 'sending');
  });
  const [loadError, setLoadError] = useState(false);

  const width = message.image_width || 300;
  const height = message.image_height || 200;

  const isSending = message.status === 'sending';
  const isFailed = message.status === 'failed';

  useEffect(() => {
    let isMounted = true;

    if (!rawUrl) {
      setLoadError(true);
      return;
    }

    // Direct preview for optimistic images
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
      setResolvedSrc(rawUrl);
      setLoadError(false);
      return;
    }

    let acquired = false;
    setLoadError(false);
    getAuthenticatedMediaUrl(rawUrl)
      .then((url) => {
        if (isMounted) {
          if (url) {
            acquireMediaUrl(rawUrl);
            acquired = true;
            setResolvedSrc(url);
            setLoadError(false);
          } else {
            setLoadError(true);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setLoadError(true);
        }
      });

    return () => {
      isMounted = false;
      if (acquired) {
        releaseMediaUrl(rawUrl);
      }
    };
  }, [rawUrl]);

  return (
    <div className="relative group/img overflow-hidden rounded-xl max-w-[260px] sm:max-w-[320px] select-none my-0.5">
      {/* Aspect Ratio Container to eliminate layout shift */}
      <div
        style={{
          aspectRatio: `${width} / ${height}`,
          maxHeight: '340px',
        }}
        className="relative w-full bg-slate-900/90 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer"
        onClick={() => {
          if (!isSending && !isFailed && !loadError && onImageClick) {
            onImageClick(message);
          }
        }}
      >
        {/* Skeleton Shimmer placeholder */}
        {!isLoaded && !loadError && (
          <div className="absolute inset-0 bg-slate-800 animate-pulse flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        )}

        {/* Actual Image */}
        {resolvedSrc && !loadError ? (
          <img
            src={resolvedSrc}
            alt="Shared photo"
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              setLoadError(true);
              setIsLoaded(true);
            }}
            className={`w-full h-full object-cover rounded-xl transition-all duration-200 group-hover/img:scale-[1.02] ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-slate-500 gap-1 text-center">
            <AlertCircle className="w-5 h-5 text-rose-400" />
            <span className="text-[11px]">Failed to load image</span>
            {!isSending && !isFailed && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLoadError(false);
                  setIsLoaded(false);
                  if (rawUrl) {
                    getAuthenticatedMediaUrl(rawUrl).then((url) => {
                      if (url) {
                        setResolvedSrc(url);
                        setLoadError(false);
                      } else {
                        setLoadError(true);
                      }
                    }).catch(() => setLoadError(true));
                  }
                }}
                className="mt-1 px-2.5 py-1 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors cursor-pointer"
              >
                Retry loading
              </button>
            )}
          </div>
        )}

        {/* Hover Zoom Hint */}
        {isLoaded && !isSending && !isFailed && !loadError && (
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <div className="p-2 rounded-full bg-black/75 text-white shadow-md">
              <ZoomIn className="w-4 h-4" />
            </div>
          </div>
        )}

        {/* Sending Overlay */}
        {isSending && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-1.5 text-white z-10">
            <Loader2 className="w-6 h-6 animate-spin text-pink-400" />
            <span className="text-[11px] font-medium tracking-wide">Sending photo...</span>
          </div>
        )}

        {/* Failed Overlay with Retry */}
        {isFailed && (
          <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-2 text-white z-10 p-2">
            <span className="text-xs text-rose-300 font-semibold">Upload Failed</span>
            {onRetry && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(message);
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-500/30 hover:bg-rose-500/50 border border-rose-400/50 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default ChatImageMessage;

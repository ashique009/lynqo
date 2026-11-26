import React, { useState, useEffect } from 'react';
import { CornerUpLeft, X } from 'lucide-react';
import { getAuthenticatedMediaUrl } from '../../utils/mediaUrl';

export const AuthenticatedReplyThumbnail = React.memo(({ rawUrl }) => {
  const [src, setSrc] = useState(() =>
    rawUrl && (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) ? rawUrl : null
  );

  useEffect(() => {
    let active = true;
    if (!rawUrl) {
      setSrc(null);
      return;
    }
    if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
      setSrc(rawUrl);
      return;
    }
    getAuthenticatedMediaUrl(rawUrl)
      .then((resolved) => {
        if (active && resolved) setSrc(resolved);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [rawUrl]);

  if (!src) return null;
  return (
    <img
      src={src}
      alt="Preview"
      className="w-9 h-9 rounded-lg object-cover shrink-0 border border-slate-700"
    />
  );
});

export const ReplyPreview = React.memo(({ replyingTo, currentProfileId, onCancel }) => {
  if (!replyingTo) return null;

  return (
    <div className="liquid-glass-pill mx-2.5 mb-2 px-3.5 py-2 rounded-2xl flex items-center justify-between gap-2.5 text-xs">
      <div className="flex items-center gap-2.5 min-w-0 flex-grow">
        <div className="w-[3px] self-stretch rounded-full bg-gradient-to-b from-[#8B68F6] to-[#EC6EB8] shrink-0" />
        <div className="min-w-0 flex-grow">
          <div className="flex items-center gap-1.5">
            <CornerUpLeft className="w-3.5 h-3.5 text-[#C4B5FD] shrink-0" />
            <span className="font-semibold text-white truncate text-[12px]">
              Replying to{' '}
              {replyingTo.sender_profile_id === currentProfileId
                ? 'yourself'
                : replyingTo.sender_display_name || replyingTo.sender_profile_id || 'User'}
            </span>
          </div>
          <div className="text-[#93889D] dark:text-[#94A3B8] text-[12px] truncate mt-0.5">
            {replyingTo.is_deleted ? (
              <span className="italic opacity-75">This message was deleted</span>
            ) : (
              replyingTo.content ||
              (replyingTo.message_type === 'image'
                ? 'Photo'
                : replyingTo.message_type === 'voice'
                ? `Voice message ${replyingTo.duration_seconds ? `(${replyingTo.duration_seconds}s)` : ''}`
                : 'Message')
            )}
          </div>
        </div>
        {(replyingTo.thumbnail_url || replyingTo.image_url || replyingTo.local_preview_url) && !replyingTo.is_deleted && (
          <AuthenticatedReplyThumbnail
            rawUrl={replyingTo.thumbnail_url || replyingTo.image_url || replyingTo.local_preview_url}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="min-w-[40px] min-h-[40px] -mr-1 rounded-full text-[#93889D] dark:text-[#94A3B8] hover:text-[#38323F] dark:hover:text-[#F1F5F9] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all shrink-0 cursor-pointer flex items-center justify-center"
        title="Cancel reply"
        aria-label="Cancel reply"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});

export default ReplyPreview;

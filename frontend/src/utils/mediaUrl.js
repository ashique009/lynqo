import client, { API_BASE_URL } from '../api/client.js';

// LRU cache for authenticated object URLs: rawUrl -> { objectUrl, lastUsed, isCustomBlob }
const mediaBlobCache = new Map();
const inFlightRequests = new Map();
const MAX_CACHE_ENTRIES = 80;

/**
 * Resolves an authenticated media URL (image or audio) into a browser-loadable URL.
 * If rawUrl is already a local blob (optimistic upload), returns it directly.
 * Otherwise, fetches binary data using the authenticated Axios client (with Bearer token & cookies),
 * converts to an in-memory object URL, and caches it with automatic LRU cleanup.
 */
export const getAuthenticatedMediaUrl = async (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  // Optimistic preview or data URLs can be used immediately
  if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
    return rawUrl;
  }

  // Check LRU cache
  if (mediaBlobCache.has(rawUrl)) {
    const entry = mediaBlobCache.get(rawUrl);
    entry.lastUsed = Date.now();
    return entry.objectUrl;
  }

  // Deduplicate concurrent in-flight requests for the same media
  if (inFlightRequests.has(rawUrl)) {
    return inFlightRequests.get(rawUrl);
  }

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('lynqo_token') : null;
  const baseUrl = (API_BASE_URL || '').replace(/\/+$/, '');
  const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  const fullUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? rawUrl
    : `${baseUrl}${path}`;

  const fetchPromise = (async () => {
    try {
      const response = await client.get(fullUrl, {
        responseType: 'blob',
        skipDeduplication: true,
      });

      let blob;
      if (response instanceof Blob) {
        blob = response;
      } else if (response && response.data instanceof Blob) {
        blob = response.data;
      } else {
        // Fallback for binary arraybuffer / data
        const mime = rawUrl.includes('/audio/') ? 'audio/webm' : 'image/jpeg';
        blob = new Blob([response], { type: mime });
      }

      const objectUrl = URL.createObjectURL(blob);

      // Evict oldest entries if capacity reached
      if (mediaBlobCache.size >= MAX_CACHE_ENTRIES) {
        let oldestKey = null;
        let oldestTime = Infinity;
        for (const [k, v] of mediaBlobCache.entries()) {
          if (v.lastUsed < oldestTime) {
            oldestTime = v.lastUsed;
            oldestKey = k;
          }
        }
        if (oldestKey) {
          const oldEntry = mediaBlobCache.get(oldestKey);
          if (oldEntry?.objectUrl && oldEntry.objectUrl.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(oldEntry.objectUrl);
            } catch (e) {
              // ignore
            }
          }
          mediaBlobCache.delete(oldestKey);
        }
      }

      mediaBlobCache.set(rawUrl, {
        objectUrl,
        lastUsed: Date.now(),
        isCustomBlob: true,
      });

      return objectUrl;
    } catch (err) {
      // Secure fallback: Never leak session token into URL query parameters
      return null;
    } finally {
      inFlightRequests.delete(rawUrl);
    }
  })();

  inFlightRequests.set(rawUrl, fetchPromise);
  return fetchPromise;
};

/**
 * Preload media into cache in the background.
 */
export const preloadMedia = (rawUrl) => {
  if (rawUrl && !mediaBlobCache.has(rawUrl) && !inFlightRequests.has(rawUrl)) {
    getAuthenticatedMediaUrl(rawUrl).catch(() => {});
  }
};

/**
 * Clean up all cached object URLs on logout or user switch to prevent memory leaks.
 */
export const clearMediaCache = () => {
  for (const entry of mediaBlobCache.values()) {
    if (entry?.objectUrl && entry.objectUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(entry.objectUrl);
      } catch (e) {
        // ignore
      }
    }
  }
  mediaBlobCache.clear();
  inFlightRequests.clear();
};

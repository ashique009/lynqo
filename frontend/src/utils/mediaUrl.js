import client, { API_BASE_URL, isExternalUrl } from '../api/client.js';

// LRU cache for authenticated object URLs: rawUrl -> { objectUrl, lastUsed, sizeBytes, activeRefs }
const mediaBlobCache = new Map();
const inFlightRequests = new Map();
const pendingRevokeByUrl = new Map();
const MAX_CACHE_ENTRIES = 80;
const MAX_CACHE_BYTES = 48 * 1024 * 1024; // 48 MB memory ceiling for mobile browsers
let totalCacheBytes = 0;

const safeRevoke = (objectUrl) => {
  if (objectUrl && objectUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(objectUrl);
    } catch (_) {}
  }
};

const evictIfNeeded = () => {
  while (
    (mediaBlobCache.size >= MAX_CACHE_ENTRIES || totalCacheBytes > MAX_CACHE_BYTES) &&
    mediaBlobCache.size > 0
  ) {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [k, v] of mediaBlobCache.entries()) {
      // Prefer evicting inactive entries first so mounted/playing media stays alive
      if (v.activeRefs === 0 && v.lastUsed < oldestTime) {
        oldestTime = v.lastUsed;
        oldestKey = k;
      }
    }
    if (!oldestKey) {
      // All entries are actively referenced; stop evicting to protect active media
      break;
    }
    const oldEntry = mediaBlobCache.get(oldestKey);
    mediaBlobCache.delete(oldestKey);
    totalCacheBytes = Math.max(0, totalCacheBytes - (oldEntry?.sizeBytes || 0));
    safeRevoke(oldEntry?.objectUrl);
  }
};

const storeInCache = (key, objectUrl, sizeBytes = 0) => {
  const existing = mediaBlobCache.get(key);
  if (existing) {
    totalCacheBytes = Math.max(0, totalCacheBytes - (existing.sizeBytes || 0));
  }
  totalCacheBytes += sizeBytes;
  evictIfNeeded();

  mediaBlobCache.set(key, {
    objectUrl,
    lastUsed: Date.now(),
    sizeBytes,
    activeRefs: existing ? existing.activeRefs : 0,
  });
};

export const acquireMediaUrl = (rawUrl) => {
  const entry = mediaBlobCache.get(rawUrl);
  if (entry) {
    entry.activeRefs += 1;
    entry.lastUsed = Date.now();
  }
};

export const releaseMediaUrl = (rawUrl) => {
  const entry = mediaBlobCache.get(rawUrl);
  if (entry) {
    entry.activeRefs = Math.max(0, entry.activeRefs - 1);
    if (entry.activeRefs === 0 && pendingRevokeByUrl.has(entry.objectUrl)) {
      pendingRevokeByUrl.delete(entry.objectUrl);
      safeRevoke(entry.objectUrl);
    }
  }
};

export const getMediaCacheStats = () => ({
  entries: mediaBlobCache.size,
  totalBytes: totalCacheBytes,
  maxEntries: MAX_CACHE_ENTRIES,
  maxBytes: MAX_CACHE_BYTES,
});

/**
 * Resolves an authenticated media URL (image or audio) into a browser-loadable URL.
 * If rawUrl is already a local blob (optimistic upload), returns it directly.
 * Uses a secure two-step flow for protected Cloudinary media:
 * 1. Requests short-lived signed URL or proxy from LYNQO backend using credentials.
 * 2. Fetches binary media directly from Cloudinary without credentials ('credentials: omit'),
 *    completely eliminating cross-origin credential issues with Cloudinary wildcard CORS.
 * Converts to an in-memory object URL, and caches it with automatic LRU cleanup.
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

  const baseUrl = (API_BASE_URL || '').replace(/\/+$/, '');
  const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
  const fullUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? rawUrl
    : `${baseUrl}${path}`;

  const fetchPromise = (async () => {
    try {
      // If rawUrl is already an external URL (e.g., direct Cloudinary CDN URL),
      // fetch without credentials to avoid CORS wildcard credential rejection.
      if (isExternalUrl(fullUrl)) {
        const mediaRes = await fetch(fullUrl, {
          credentials: 'omit',
          mode: 'cors',
        });
        if (!mediaRes.ok) {
          throw new Error(`Media fetch failed: ${mediaRes.status}`);
        }
        const blob = await mediaRes.blob();
        const objectUrl = URL.createObjectURL(blob);
        storeInCache(rawUrl, objectUrl, blob.size || 0);
        return objectUrl;
      }

      // Step 1: Request short-lived signed URL from LYNQO backend with credentials
      const separator = fullUrl.includes('?') ? '&' : '?';
      const jsonUrl = fullUrl.includes('json=1') ? fullUrl : `${fullUrl}${separator}json=1`;

      let response;
      try {
        response = await client.get(jsonUrl, {
          skipDeduplication: true,
        });
      } catch (backendErr) {
        // Fallback: If json=1 request fails, attempt direct blob request
        response = await client.get(fullUrl, {
          responseType: 'blob',
          skipDeduplication: true,
        });
      }

      // If response is already binary blob (e.g. from FileResponse or mock)
      let directBlob = null;
      if (response instanceof Blob) {
        directBlob = response;
      } else if (response && response.data instanceof Blob) {
        directBlob = response.data;
      }

      if (directBlob) {
        const objectUrl = URL.createObjectURL(directBlob);
        storeInCache(rawUrl, objectUrl, directBlob.size || 0);
        return objectUrl;
      }

      const signedMediaUrl = response?.image_url || response?.audio_url;

      if (signedMediaUrl) {
        // Step 2: Fetch media bytes
        if (isExternalUrl(signedMediaUrl)) {
          // Cloudinary / external CDN: fetch with credentials: 'omit'
          try {
            const mediaRes = await fetch(signedMediaUrl, {
              credentials: 'omit',
              mode: 'cors',
            });
            if (!mediaRes.ok) {
              throw new Error(`CDN fetch failed: ${mediaRes.status}`);
            }
            const blob = await mediaRes.blob();
            const objectUrl = URL.createObjectURL(blob);
            storeInCache(rawUrl, objectUrl, blob.size || 0);
            return objectUrl;
          } catch (cdnErr) {
            // Fallback to backend authenticated proxy (?proxy=1) if direct CDN fetch fails
            const proxySeparator = fullUrl.includes('?') ? '&' : '?';
            const proxyUrl = fullUrl.includes('proxy=1') ? fullUrl : `${fullUrl}${proxySeparator}proxy=1`;
            const proxyResp = await client.get(proxyUrl, {
              responseType: 'blob',
              skipDeduplication: true,
            });
            const fallbackBlob = proxyResp instanceof Blob
              ? proxyResp
              : (proxyResp?.data instanceof Blob ? proxyResp.data : new Blob([proxyResp]));
            const objectUrl = URL.createObjectURL(fallbackBlob);
            storeInCache(rawUrl, objectUrl, fallbackBlob.size || 0);
            return objectUrl;
          }
        } else {
          // Internal relative media path (e.g. local disk storage): fetch with client
          const internalPath = signedMediaUrl.startsWith('/') ? signedMediaUrl : `/${signedMediaUrl}`;
          const internalFullUrl = signedMediaUrl.startsWith('http://') || signedMediaUrl.startsWith('https://')
            ? signedMediaUrl
            : `${baseUrl}${internalPath}`;
          const internalResp = await client.get(internalFullUrl, {
            responseType: 'blob',
            skipDeduplication: true,
          });
          const internalBlob = internalResp instanceof Blob
            ? internalResp
            : (internalResp?.data instanceof Blob ? internalResp.data : new Blob([internalResp]));
          const objectUrl = URL.createObjectURL(internalBlob);
          storeInCache(rawUrl, objectUrl, internalBlob.size || 0);
          return objectUrl;
        }
      }

      // Fallback for raw binary arraybuffer / data
      if (response) {
        const mime = rawUrl.includes('/audio/') ? 'audio/webm' : 'image/jpeg';
        const fallbackBlob = new Blob([response], { type: mime });
        const objectUrl = URL.createObjectURL(fallbackBlob);
        storeInCache(rawUrl, objectUrl, fallbackBlob.size || 0);
        return objectUrl;
      }

      return null;
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
    safeRevoke(entry?.objectUrl);
  }
  mediaBlobCache.clear();
  inFlightRequests.clear();
  pendingRevokeByUrl.clear();
  totalCacheBytes = 0;
};

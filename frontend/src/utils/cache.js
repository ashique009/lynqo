// Lightweight in-memory SWR (Stale-While-Revalidate) cache with user isolation
const cache = new Map();
let currentScope = null;

export const setCacheUserScope = (scope) => {
  const newScope = scope ? String(scope) : null;
  if (currentScope && newScope && currentScope !== newScope) {
    // Isolated user context: clear cache on user profile switch
    cache.clear();
  }
  currentScope = newScope;
};

export const getCacheUserScope = () => {
  if (currentScope) return currentScope;
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('lynqo_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.profile_id) {
          currentScope = String(parsed.profile_id);
          return currentScope;
        }
      }
    }
  } catch {
    // ignore JSON parsing errors
  }
  return 'anonymous';
};

const getScopedKey = (key) => `${getCacheUserScope()}::${key}`;

export const cacheGet = (key) => {
  const scopedKey = getScopedKey(key);
  const item = cache.get(scopedKey);
  if (!item) return null;
  if (item.expiry && Date.now() > item.expiry) {
    cache.delete(scopedKey);
    return null;
  }
  return item.value;
};

export const cacheSet = (key, value, ttlSeconds = 120) => {
  const scopedKey = getScopedKey(key);
  cache.set(scopedKey, {
    value,
    expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
};

export const cacheInvalidate = (prefix) => {
  if (!prefix) {
    cache.clear();
    return;
  }
  const scopePrefix = `${getCacheUserScope()}::${prefix}`;
  for (const k of cache.keys()) {
    if (k.startsWith(scopePrefix)) {
      cache.delete(k);
    }
  }
};

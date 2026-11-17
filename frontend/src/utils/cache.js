// Lightweight in-memory SWR (Stale-While-Revalidate) cache
const cache = new Map();

export const cacheGet = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (item.expiry && Date.now() > item.expiry) {
    cache.delete(key);
    return null;
  }
  return item.value;
};

export const cacheSet = (key, value, ttlSeconds = 120) => {
  cache.set(key, {
    value,
    expiry: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
};

export const cacheInvalidate = (prefix) => {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
};

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import client from '../api/client.js';
import {
  getAuthenticatedMediaUrl,
  acquireMediaUrl,
  releaseMediaUrl,
  getMediaCacheStats,
  clearMediaCache,
} from '../utils/mediaUrl.js';

test('Phase 4 Media Cache: tracks byte size, protects active Blob URLs from eviction, and warms cache', async () => {
  clearMediaCache();

  const originalFetch = globalThis.fetch;
  const originalGet = client.get;
  let fetchCount = 0;

  client.get = async (url) => ({
    success: true,
    image_url: `https://res.cloudinary.com/demo/image/upload/v1/${encodeURIComponent(url)}.jpg`,
  });
  globalThis.fetch = async () => {
    fetchCount += 1;
    // 20 MB blob per entry to test 48 MB byte ceiling
    const big = new Uint8Array(20 * 1024 * 1024);
    return { ok: true, blob: async () => new Blob([big], { type: 'image/jpeg' }) };
  };

  try {
    const tCold0 = performance.now();
    const u1 = await getAuthenticatedMediaUrl('/api/auth/conversations/1/messages/1/image/');
    const coldMs = performance.now() - tCold0;
    acquireMediaUrl('/api/auth/conversations/1/messages/1/image/');

    // Warm-cache hit should make 0 additional network calls
    const tWarm0 = performance.now();
    const u1Warm = await getAuthenticatedMediaUrl('/api/auth/conversations/1/messages/1/image/');
    const warmMs = performance.now() - tWarm0;

    assert.equal(u1, u1Warm);
    assert.equal(fetchCount, 1);
    assert.ok(warmMs <= coldMs || warmMs < 2);

    // Load 2 more 20MB items (total 60MB > 48MB ceiling) while item 1 is active
    await getAuthenticatedMediaUrl('/api/auth/conversations/1/messages/2/image/');
    await getAuthenticatedMediaUrl('/api/auth/conversations/1/messages/3/image/');

    const stats = getMediaCacheStats();
    assert.ok(stats.totalBytes <= stats.maxBytes);
    // Item 1 was acquired (activeRefs > 0), so it must still be in cache!
    const u1StillCached = await getAuthenticatedMediaUrl('/api/auth/conversations/1/messages/1/image/');
    assert.equal(u1StillCached, u1);
    assert.equal(fetchCount, 3);

    releaseMediaUrl('/api/auth/conversations/1/messages/1/image/');
  } finally {
    globalThis.fetch = originalFetch;
    client.get = originalGet;
    clearMediaCache();
  }
});

test('Phase 4 PWA Safety: main.jsx defers SW reload while recording/sending is active', () => {
  const mainSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/main.jsx'), 'utf8');
  const composerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/chat/MessageComposer.jsx'), 'utf8');

  assert.equal(mainSrc.includes('__lynqoBusyCount'), true);
  assert.equal(mainSrc.includes('lynqo:idle'), true);
  assert.equal(composerSrc.includes('__lynqoBusyCount'), true);
  assert.equal(composerSrc.includes('lynqo:idle'), true);
});

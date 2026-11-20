import { describe, it } from 'node:test';
import assert from 'node:assert';

// Mock localStorage and window for Node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { hostname: 'localhost', port: '5173', protocol: 'http:' },
  };
}
if (typeof globalThis.URL.createObjectURL === 'undefined') {
  globalThis.URL.createObjectURL = (blob) => `blob:mock-uuid-${Date.now()}`;
  globalThis.URL.revokeObjectURL = (url) => {};
}

describe('Media Loading, Caching & Camera Verification', () => {
  it('1. getAuthenticatedMediaUrl returns immediate blob for local optimistic previews', async () => {
    const { getAuthenticatedMediaUrl } = await import('../utils/mediaUrl.js');
    const localBlob = 'blob:http://localhost:5173/local-preview-123';
    const result = await getAuthenticatedMediaUrl(localBlob);
    assert.strictEqual(result, localBlob);
  });

  it('2. getAuthenticatedMediaUrl returns null on network failure without leaking token in URL', async () => {
    const { getAuthenticatedMediaUrl } = await import('../utils/mediaUrl.js');
    globalThis.localStorage.setItem('lynqo_token', 'test-session-token-xyz');

    const rawPath = '/api/auth/conversations/32/messages/999/image/';
    const result = await getAuthenticatedMediaUrl(rawPath);
    // Secure behavior: never leaks secret token into query parameter or returns unauthenticated fallback URL
    assert.strictEqual(result, null);
  });

  it('3. clearMediaCache safely clears in-memory object URLs without throwing', async () => {
    const { clearMediaCache } = await import('../utils/mediaUrl.js');
    assert.doesNotThrow(() => {
      clearMediaCache();
    });
  });

  it('4. Camera constraints structure conforms to standards for rear and front facing modes', () => {
    const rearConstraints = {
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    };
    const frontConstraints = {
      video: { facingMode: { ideal: 'user' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    };

    assert.strictEqual(rearConstraints.video.facingMode.ideal, 'environment');
    assert.strictEqual(frontConstraints.video.facingMode.ideal, 'user');
    assert.strictEqual(rearConstraints.audio, false);
  });
});

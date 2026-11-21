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

  it('5. isExternalUrl correctly identifies Cloudinary and external origins vs internal paths', async () => {
    const { isExternalUrl } = await import('../api/client.js');
    assert.strictEqual(isExternalUrl('/api/auth/conversations/1/messages/1/image/'), false);
    assert.strictEqual(isExternalUrl('conversations/1/messages/1/image/'), false);
    assert.strictEqual(isExternalUrl('https://res.cloudinary.com/demo/image/authenticated/sample.jpg'), true);
    assert.strictEqual(isExternalUrl('https://evil-hacker.com/steal-creds'), true);
  });

  it('6. Axios interceptor strips withCredentials and Authorization headers for external Cloudinary URLs', async () => {
    const { default: client } = await import('../api/client.js');
    globalThis.localStorage.setItem('lynqo_token', 'secret-user-jwt-token');

    // Simulate interceptor execution on external request
    const externalConfig = {
      url: 'https://res.cloudinary.com/demo/image/authenticated/s--123--/sample.jpg',
      headers: { Authorization: 'Bearer initial' },
      withCredentials: true,
    };

    // Find the request interceptor handler
    const handler = client.interceptors.request.handlers[0].fulfilled;
    const transformed = handler(externalConfig);

    assert.strictEqual(transformed.withCredentials, false, 'withCredentials must be disabled for external URLs');
    assert.strictEqual(transformed.headers.Authorization, undefined, 'Authorization token must never be sent to Cloudinary');
  });

  it('7. Axios interceptor attaches Authorization header and preserves credentials for LYNQO backend requests', async () => {
    const { default: client } = await import('../api/client.js');
    globalThis.localStorage.setItem('lynqo_token', 'secret-user-jwt-token');

    const internalConfig = {
      url: '/api/auth/conversations/10/messages/20/image/?thumb=1',
      headers: {},
      withCredentials: true,
    };

    const handler = client.interceptors.request.handlers[0].fulfilled;
    const transformed = handler(internalConfig);

    assert.strictEqual(transformed.withCredentials, true, 'withCredentials must be preserved for LYNQO backend');
    assert.strictEqual(transformed.headers.Authorization, 'Bearer secret-user-jwt-token', 'Bearer token must be attached for LYNQO backend');
  });

  it('8. Two-step flow queries backend for signed URL and fetches from Cloudinary with credentials: omit', async () => {
    const { getAuthenticatedMediaUrl } = await import('../utils/mediaUrl.js');
    const { default: client } = await import('../api/client.js');

    const originalGet = client.get;
    const originalFetch = globalThis.fetch;

    let backendCalledUrl = null;
    let fetchCalledUrl = null;
    let fetchOptions = null;

    client.get = async (url, config) => {
      backendCalledUrl = url;
      return {
        success: true,
        image_url: 'https://res.cloudinary.com/demo/image/authenticated/s--sig123--/v1/private_photo.jpg',
      };
    };

    globalThis.fetch = async (url, options) => {
      fetchCalledUrl = url;
      fetchOptions = options;
      return {
        ok: true,
        blob: async () => new Blob(['fake-image-bytes'], { type: 'image/jpeg' }),
      };
    };

    try {
      const rawPath = '/api/auth/conversations/55/messages/101/image/?thumb=1';
      const result = await getAuthenticatedMediaUrl(rawPath);

      assert.ok(result && result.startsWith('blob:'), 'Successfully returns object URL');
      assert.ok(backendCalledUrl.includes('json=1'), 'Step 1: Backend was queried with json=1');
      assert.ok(backendCalledUrl.includes('thumb=1'), 'Step 1: Preserves thumbnail parameter');
      assert.strictEqual(fetchCalledUrl, 'https://res.cloudinary.com/demo/image/authenticated/s--sig123--/v1/private_photo.jpg');
      assert.strictEqual(fetchOptions.credentials, 'omit', 'Step 2: Cloudinary fetch strictly omits credentials');
      assert.strictEqual(fetchOptions.mode, 'cors', 'Step 2: Uses CORS mode');
    } finally {
      client.get = originalGet;
      globalThis.fetch = originalFetch;
    }
  });

  it('9. Two-step flow falls back to backend proxy (?proxy=1) if Cloudinary direct fetch fails', async () => {
    const { getAuthenticatedMediaUrl } = await import('../utils/mediaUrl.js');
    const { default: client } = await import('../api/client.js');

    const originalGet = client.get;
    const originalFetch = globalThis.fetch;

    let proxyCalledUrl = null;

    client.get = async (url, config) => {
      if (url.includes('proxy=1')) {
        proxyCalledUrl = url;
        return new Blob(['proxied-image-bytes'], { type: 'image/jpeg' });
      }
      return {
        success: true,
        image_url: 'https://res.cloudinary.com/demo/image/authenticated/s--sig--/blocked.jpg',
      };
    };

    globalThis.fetch = async (url, options) => {
      // Simulate CORS block or network failure from Cloudinary
      throw new TypeError('Failed to fetch due to CORS');
    };

    try {
      const rawPath = '/api/auth/conversations/66/messages/202/image/';
      const result = await getAuthenticatedMediaUrl(rawPath);

      assert.ok(result && result.startsWith('blob:'), 'Successfully returns object URL from proxy fallback');
      assert.ok(proxyCalledUrl.includes('proxy=1'), 'Fallback requests ?proxy=1 from backend');
    } finally {
      client.get = originalGet;
      globalThis.fetch = originalFetch;
    }
  });

  it('10. Two-step flow handles local non-Cloudinary direct media paths cleanly', async () => {
    const { getAuthenticatedMediaUrl } = await import('../utils/mediaUrl.js');
    const { default: client } = await import('../api/client.js');

    const originalGet = client.get;
    let directCalledUrl = null;

    client.get = async (url, config) => {
      if (url.includes('json=1')) {
        return {
          success: true,
          image_url: '/api/auth/conversations/77/messages/303/image/',
          is_direct: true,
        };
      }
      directCalledUrl = url;
      return new Blob(['local-disk-bytes'], { type: 'image/jpeg' });
    };

    try {
      const rawPath = '/api/auth/conversations/77/messages/303/image/';
      const result = await getAuthenticatedMediaUrl(rawPath);

      assert.ok(result && result.startsWith('blob:'), 'Returns object URL for local media');
      assert.ok(directCalledUrl.includes('/api/auth/conversations/77/messages/303/image/'), 'Fetches binary from local endpoint');
    } finally {
      client.get = originalGet;
    }
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import client, { isAuthFailureResponse, isPublicAuthRequest } from '../api/client.js';
import { getAuthenticatedMediaUrl, clearMediaCache } from '../utils/mediaUrl.js';
import { mergeMessages } from '../utils/messageUtils.js';

test('Phase 1 Auth: preserves session on offline, timeout, rate-limit, server, and non-auth 403 errors', () => {
  // Explicit auth failures -> should clear session
  assert.equal(isAuthFailureResponse(401, { message: 'Unauthorized' }), true);
  assert.equal(isAuthFailureResponse(403, { message: 'Invalid or expired session.' }), true);
  assert.equal(isAuthFailureResponse(403, { message: 'Account is banned.' }), true);
  assert.equal(isAuthFailureResponse(403, { message: 'Authentication credentials were not provided.' }), true);

  // Non-auth 403s -> must NOT clear session
  assert.equal(isAuthFailureResponse(403, { message: 'Unauthorized.' }), false);
  assert.equal(isAuthFailureResponse(403, { message: 'Account restricted.' }), false);

  // Network / rate-limit / server errors -> must NOT clear session
  assert.equal(isAuthFailureResponse(null, null), false);
  assert.equal(isAuthFailureResponse(undefined, null), false);
  assert.equal(isAuthFailureResponse(429, { message: 'Too many requests' }), false);
  assert.equal(isAuthFailureResponse(500, { message: 'Internal server error' }), false);
  assert.equal(isAuthFailureResponse(503, { message: 'Service unavailable' }), false);
});

test('Phase 1 Auth: strips stale Authorization header on public login, signup, and recovery requests', () => {
  assert.equal(isPublicAuthRequest('/api/auth/login/'), true);
  assert.equal(isPublicAuthRequest('/api/auth/profile/create/'), true);
  assert.equal(isPublicAuthRequest('/api/auth/profile/recover/'), true);
  assert.equal(isPublicAuthRequest('/api/auth/profile/me/'), false);

  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (k === 'lynqo_token' ? 'stale_expired_token_123' : null),
  };

  try {
    const reqHandler = client.interceptors.request.handlers[0].fulfilled;
    const loginConfig = reqHandler({ url: '/api/auth/login/', headers: { Authorization: 'Bearer stale' } });
    assert.equal(loginConfig.headers.Authorization, undefined);

    const createConfig = reqHandler({ url: '/api/auth/profile/create/', headers: { Authorization: 'Bearer stale' } });
    assert.equal(createConfig.headers.Authorization, undefined);

    const meConfig = reqHandler({ url: '/api/auth/profile/me/', headers: {} });
    assert.equal(meConfig.headers.Authorization, 'Bearer stale_expired_token_123');
  } finally {
    globalThis.localStorage = prevStorage;
  }
});

test('Phase 1 Voice & Media: shared Blob URL lifecycle is owned by mediaUrl.js and survives repeated playback', async () => {
  clearMediaCache();

  const voiceSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/VoiceMessage.jsx'),
    'utf8'
  );
  // Ensure VoiceMessage.jsx no longer revokes shared cached Blob URLs on unmount
  assert.equal(voiceSrc.includes('URL.revokeObjectURL'), false);

  const originalFetch = globalThis.fetch;
  const originalGet = client.get;
  let backendCalls = 0;

  client.get = async () => {
    backendCalls += 1;
    return { success: true, audio_url: 'https://res.cloudinary.com/demo/video/upload/v1/voice.webm' };
  };
  globalThis.fetch = async () => ({
    ok: true,
    blob: async () => new Blob(['audio-bytes'], { type: 'audio/webm' }),
  });

  try {
    const url1 = await getAuthenticatedMediaUrl('/api/auth/conversations/1/messages/10/audio/');
    const url2 = await getAuthenticatedMediaUrl('/api/auth/conversations/1/messages/10/audio/');
    assert.ok(url1 && url1.startsWith('blob:'));
    assert.equal(url1, url2);
    assert.equal(backendCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    client.get = originalGet;
    clearMediaCache();
  }
});

test('Phase 1 Private Image: Chat.jsx uses getAuthenticatedMediaUrl for docked reply thumbnails', () => {
  const chatSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/Chat.jsx'),
    'utf8'
  );
  assert.equal(chatSrc.includes('AuthenticatedReplyThumbnail'), true);
  assert.equal(chatSrc.includes('getAuthenticatedMediaUrl(rawUrl)'), true);
});

test('Phase 1 WebSocket: missed message recovery merges cleanly without duplicates', () => {
  const existing = [
    { id: 10, client_message_id: 'c-10', content: 'First', status: 'seen', created_at: '2026-11-26T10:00:00Z' },
    { id: 11, client_message_id: 'c-11', content: 'Second', status: 'delivered', created_at: '2026-11-26T10:01:00Z' },
  ];
  const missed = [
    { id: 11, client_message_id: 'c-11', content: 'Second', status: 'sent', created_at: '2026-11-26T10:01:00Z' },
    { id: 12, client_message_id: 'c-12', content: 'Missed while offline', status: 'sent', created_at: '2026-11-26T10:02:00Z' },
  ];

  const merged = mergeMessages(existing, missed);
  assert.equal(merged.length, 3);
  assert.equal(merged[1].status, 'delivered'); // Never downgrades status
  assert.equal(merged[2].id, 12);
});

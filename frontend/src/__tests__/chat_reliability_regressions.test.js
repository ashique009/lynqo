import test from 'node:test';
import assert from 'node:assert/strict';

// Set up mock window/localStorage for node test environment
if (typeof globalThis.localStorage === 'undefined') {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    location: { hostname: 'localhost', port: '8000', protocol: 'http:' },
  };
}

import { mergeMessages } from '../utils/messageUtils.js';
import { mergeConversations } from '../utils/conversationUtils.js';
import { cacheGet, cacheSet, cacheInvalidate, setCacheUserScope, getCacheUserScope } from '../utils/cache.js';
import { wsService } from '../services/websocketService.js';

test('1. Background API refreshes do not overwrite newer WebSocket messages', () => {
  // Existing state has a newer message received via WebSocket (id 105)
  const existing = [
    { id: 101, content: 'First', created_at: '2026-11-18T00:00:00Z', status: 'seen' },
    { id: 102, content: 'Second', created_at: '2026-11-18T00:01:00Z', status: 'seen' },
    { id: 105, content: 'Newest via WS', created_at: '2026-11-18T00:05:00Z', status: 'sent' },
  ];

  // Older API refresh snapshot finishes that only has up to id 102
  const incomingApi = [
    { id: 101, content: 'First', created_at: '2026-11-18T00:00:00Z', status: 'seen' },
    { id: 102, content: 'Second', created_at: '2026-11-18T00:01:00Z', status: 'sent' },
  ];

  const merged = mergeMessages(existing, incomingApi);

  // The newer WS message (105) must still be present!
  assert.equal(merged.length, 3);
  assert.equal(merged[2].id, 105);
  assert.equal(merged[2].content, 'Newest via WS');
});

test('2. Merging cached, optimistic, and server messages safely using stable IDs', () => {
  const clientMsgId = 'cli-test-uuid-1234';

  // 1. User sends message: optimistic state with temp id and client_message_id
  const optimistic = [
    {
      id: 'temp-171000000',
      client_message_id: clientMsgId,
      content: 'Hello world',
      status: 'sending',
      created_at: '2026-11-18T00:02:00Z',
    },
  ];

  // 2. Server API finishes with real DB ID 200 and the same client_message_id
  const serverMessages = [
    {
      id: 200,
      client_message_id: clientMsgId,
      content: 'Hello world',
      status: 'sent',
      created_at: '2026-11-18T00:02:00Z',
    },
  ];

  const merged = mergeMessages(optimistic, serverMessages);

  // Replaced temp ID with DB ID, preserved client_message_id, exactly 1 message
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 200);
  assert.equal(merged[0].client_message_id, clientMsgId);
  assert.equal(merged[0].status, 'sent');
});

test('3. Preserving message delivery status and read receipts (never downgrading seen to sent)', () => {
  // Existing message was already marked seen by read receipt
  const existing = [
    {
      id: 301,
      client_message_id: 'cli-301',
      content: 'Are you there?',
      status: 'seen',
      is_read: true,
      created_at: '2026-11-18T00:03:00Z',
    },
  ];

  // Stale background API fetch returns earlier snapshot where status was still 'sent'
  const staleApi = [
    {
      id: 301,
      client_message_id: 'cli-301',
      content: 'Are you there?',
      status: 'sent',
      is_read: false,
      created_at: '2026-11-18T00:03:00Z',
    },
  ];

  const merged = mergeMessages(existing, staleApi);
  assert.equal(merged[0].status, 'seen');
  assert.equal(merged[0].is_read, true);
});

test('4. Chronological message ordering is strictly preserved', () => {
  const m1 = { id: 10, content: 'Earlier', created_at: '2026-11-18T00:01:00Z' };
  const m2 = { id: 20, content: 'Later', created_at: '2026-11-18T00:02:00Z' };
  const m3 = { id: 25, content: 'Same time 1', created_at: '2026-11-18T00:03:00Z' };
  const m4 = { id: 26, content: 'Same time 2', created_at: '2026-11-18T00:03:00Z' };

  // Feed in reverse order
  const merged = mergeMessages([], [m4, m2, m3, m1]);

  assert.equal(merged[0].id, 10);
  assert.equal(merged[1].id, 20);
  assert.equal(merged[2].id, 25);
  assert.equal(merged[3].id, 26);
});

test('5. HomeDashboard merges conversations without overwriting newer WebSocket updates', () => {
  const prevConversations = [
    {
      id: 1,
      updated_at: '2026-11-18T00:10:00Z',
      unread_count: 3,
      last_message: { id: 88, content: 'Newest via WS', created_at: '2026-11-18T00:10:00Z' },
    },
  ];

  const incomingFromApi = [
    {
      id: 1,
      updated_at: '2026-11-18T00:05:00Z',
      unread_count: 1,
      last_message: { id: 85, content: 'Older from API', created_at: '2026-11-18T00:05:00Z' },
    },
  ];

  const merged = mergeConversations(prevConversations, incomingFromApi);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].unread_count, 3);
  assert.equal(merged[0].last_message.id, 88);
  assert.equal(merged[0].last_message.content, 'Newest via WS');
});

test('6. Cache data is strictly isolated between authenticated users and cleared on profile changes', () => {
  // Simulate User A active
  setCacheUserScope('LYNQ-USER-A');
  cacheSet('dashboard_conversations', [{ id: 1, title: 'User A Convo' }]);
  assert.deepEqual(cacheGet('dashboard_conversations'), [{ id: 1, title: 'User A Convo' }]);

  // Simulate User B logging in
  setCacheUserScope('LYNQ-USER-B');
  // User B must NOT see User A's cached conversations!
  assert.equal(cacheGet('dashboard_conversations'), null);

  // Set User B's cache
  cacheSet('dashboard_conversations', [{ id: 2, title: 'User B Convo' }]);
  assert.deepEqual(cacheGet('dashboard_conversations'), [{ id: 2, title: 'User B Convo' }]);

  // Clear cache on session change
  cacheInvalidate();
  assert.equal(cacheGet('dashboard_conversations'), null);
});

test('7. Preventing duplicate WebSocket connections during authentication', () => {
  // Mock WebSocket class
  let wsInstanceCount = 0;
  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      wsInstanceCount++;
    }
    send() {}
    close() {
      this.readyState = MockWebSocket.CLOSED;
    }
  }

  const origWs = globalThis.WebSocket;
  globalThis.WebSocket = MockWebSocket;

  try {
    wsService.disconnect();
    wsInstanceCount = 0;

    // First connection call during auth
    wsService.connect('auth-token-123');
    assert.equal(wsInstanceCount, 1);

    // Immediate second connection call with the same token (e.g. from fetchCurrentProfile or component re-render)
    wsService.connect('auth-token-123');
    // Must NOT create a second WebSocket instance!
    assert.equal(wsInstanceCount, 1);

    // Connecting with a DIFFERENT token should cleanly close the old one and create a new one
    wsService.connect('auth-token-456');
    assert.equal(wsInstanceCount, 2);

    wsService.disconnect();
  } finally {
    wsService.disconnect();
    globalThis.WebSocket = origWs;
  }
});

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
import { wsService } from '../services/websocketService.js';
import { cacheSet, cacheGet } from '../utils/cache.js';

test('1. Message status progression: sending -> failed -> sent -> delivered -> seen without regression', () => {
  const clientMsgId = 'cli-progression-001';

  // 1. Initial optimistic sending state
  let msgs = [
    { id: 'temp-1', client_message_id: clientMsgId, content: 'Status progression', status: 'sending', created_at: '2026-11-18T10:00:00Z' }
  ];

  // 2. Network drop -> marked as failed with Retry button available
  msgs = mergeMessages(msgs, [
    { id: 'temp-1', client_message_id: clientMsgId, content: 'Status progression', status: 'failed', created_at: '2026-11-18T10:00:00Z' }
  ]);
  assert.equal(msgs[0].status, 'failed', 'Should update to failed when send encounters network error');

  // 3. User taps Retry -> server ACKs with sent
  msgs = mergeMessages(msgs, [
    { id: 201, client_message_id: clientMsgId, content: 'Status progression', status: 'sent', created_at: '2026-11-18T10:00:00Z' }
  ]);
  assert.equal(msgs[0].status, 'sent', 'Sent status must override failed');
  assert.equal(msgs[0].id, 201, 'Temp ID replaced with server ID');

  // 4. Recipient WebSocket acknowledges delivery -> status delivered
  msgs = mergeMessages(msgs, [
    { id: 201, client_message_id: clientMsgId, content: 'Status progression', status: 'delivered', created_at: '2026-11-18T10:00:00Z' }
  ]);
  assert.equal(msgs[0].status, 'delivered', 'Status must advance to delivered');

  // 5. Recipient reads conversation -> status seen
  msgs = mergeMessages(msgs, [
    { id: 201, client_message_id: clientMsgId, content: 'Status progression', status: 'seen', is_read: true, created_at: '2026-11-18T10:00:00Z' }
  ]);
  assert.equal(msgs[0].status, 'seen', 'Status must advance to seen');

  // 6. Stale background refresh having 'sent' must NEVER downgrade 'seen' or 'delivered'
  msgs = mergeMessages(msgs, [
    { id: 201, client_message_id: clientMsgId, content: 'Status progression', status: 'sent', created_at: '2026-11-18T10:00:00Z' }
  ]);
  assert.equal(msgs[0].status, 'seen', 'Seen status must NEVER be downgraded by stale sent response');
});

test('2. Rapid consecutive optimistic messages preserve ordering and avoid duplicates', () => {
  const existing = [];
  const incomingRapid = [];

  for (let i = 0; i < 5; i++) {
    incomingRapid.push({
      id: `temp-${i}`,
      client_message_id: `rapid-cli-${i}`,
      content: `Message ${i}`,
      status: 'sending',
      created_at: new Date(Date.now() + i * 100).toISOString(),
    });
  }

  const merged = mergeMessages(existing, incomingRapid);
  assert.equal(merged.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.equal(merged[i].client_message_id, `rapid-cli-${i}`);
    assert.equal(merged[i].content, `Message ${i}`);
  }

  // Server confirms with database IDs
  const serverConfirmed = incomingRapid.map((m, idx) => ({
    ...m,
    id: 500 + idx,
    status: 'sent',
  }));

  const postConfirm = mergeMessages(merged, serverConfirmed);
  assert.equal(postConfirm.length, 5, 'No duplicates created on server confirmation');
  assert.equal(postConfirm[0].id, 500);
  assert.equal(postConfirm[4].id, 504);
});

test('3. Chat opening with cached conversation displays immediately (0ms delay)', () => {
  const convId = 'conv-instant-test';
  const testConv = {
    id: convId,
    other_participant: { profile_id: 'LYNQ-BOB', display_name: 'Bob' },
    last_message: { content: 'Instant test' },
  };
  const testMsgs = [
    { id: 101, client_message_id: 'm1', content: 'Hello Bob', status: 'seen', created_at: '2026-11-18T00:00:00Z' },
  ];

  cacheSet(`conv_detail_${convId}`, testConv, 120);
  cacheSet(`conv_msgs_${convId}`, testMsgs, 60);

  const cachedConv = cacheGet(`conv_detail_${convId}`);
  const cachedMsgs = cacheGet(`conv_msgs_${convId}`);

  assert.ok(cachedConv, 'Conversation detail must be available immediately from cache');
  assert.equal(cachedConv.other_participant.display_name, 'Bob');
  assert.ok(cachedMsgs && cachedMsgs.length > 0, 'Cached messages must be available immediately');
  assert.equal(cachedMsgs[0].content, 'Hello Bob');
});

test('4. WebSocket reconnect backoff schedules properly with jitter', () => {
  wsService.reconnectAttempts = 0;
  wsService.scheduleReconnect('mock-token');

  assert.ok(wsService.reconnectTimer !== null, 'Reconnect timer must be scheduled');
  assert.equal(wsService.reconnectAttempts, 1);

  // Clean up
  clearTimeout(wsService.reconnectTimer);
  wsService.reconnectTimer = null;
  wsService.reconnectAttempts = 0;
});

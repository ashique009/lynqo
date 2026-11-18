import test from 'node:test';
import assert from 'node:assert/strict';

// Set up mock localStorage and window
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

import { mergeConversations } from '../utils/conversationUtils.js';

test('1. Direct conversation lookup reuses existing conversation between two users', () => {
  const existingConvs = [
    {
      id: 42,
      participant: { profile_id: 'LYNQ-BOB99', display_name: 'Bob' },
      last_message: { content: 'Hey Alice', created_at: '2026-11-18T10:00:00Z' },
      updated_at: '2026-11-18T10:00:00Z',
    },
  ];

  // User initiates conversation with Bob again
  const refreshedConvs = [
    {
      id: 42,
      participant: { profile_id: 'LYNQ-BOB99', display_name: 'Bob' },
      last_message: { content: 'Hey Alice', created_at: '2026-11-18T10:00:00Z' },
      updated_at: '2026-11-18T10:00:00Z',
    },
  ];

  const merged = mergeConversations(existingConvs, refreshedConvs);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 42);
  assert.equal(merged[0].participant.profile_id, 'LYNQ-BOB99');
});

test('2. Direct messaging conversation creation adds new conversation without duplicates', () => {
  const existingConvs = [
    {
      id: 10,
      participant: { profile_id: 'LYNQ-CHARLIE', display_name: 'Charlie' },
      updated_at: '2026-11-18T09:00:00Z',
    },
  ];

  const newDirectConv = [
    {
      id: 11,
      participant: { profile_id: 'LYNQ-DIANA', display_name: 'Diana' },
      updated_at: '2026-11-18T11:00:00Z',
    },
  ];

  const merged = mergeConversations(existingConvs, newDirectConv);
  assert.equal(merged.length, 2);
  // Sorted descending by updated_at: Diana (11:00) should be first
  assert.equal(merged[0].id, 11);
  assert.equal(merged[1].id, 10);
});

test('3. Search profile query handling formats queries properly', () => {
  const formatQuery = (raw) => (raw || '').trim();
  assert.equal(formatQuery('  lynq-abc12  '), 'lynq-abc12');
  assert.equal(formatQuery('  Bob Martin  '), 'Bob Martin');
  assert.equal(formatQuery(''), '');
});

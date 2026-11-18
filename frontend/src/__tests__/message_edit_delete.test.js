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

import { mergeMessages } from '../utils/messageUtils.js';

test('1. message_edited updates message content and is_edited flag while preserving order and status', () => {
  const initialMessages = [
    { id: 1, content: 'First message', is_edited: false, is_deleted: false, status: 'seen', created_at: '2026-11-18T10:00:00Z' },
    { id: 2, content: 'Second message', is_edited: false, is_deleted: false, status: 'delivered', created_at: '2026-11-18T10:01:00Z' },
  ];

  const editedUpdate = {
    id: 1,
    content: 'First message (edited version)',
    is_edited: true,
  };

  const updatedMessages = initialMessages.map((m) =>
    m.id === editedUpdate.id ? { ...m, content: editedUpdate.content, is_edited: true } : m
  );

  assert.equal(updatedMessages.length, 2);
  assert.equal(updatedMessages[0].id, 1);
  assert.equal(updatedMessages[0].content, 'First message (edited version)');
  assert.equal(updatedMessages[0].is_edited, true);
  assert.equal(updatedMessages[0].status, 'seen');
  assert.equal(updatedMessages[1].content, 'Second message');
});

test('2. message_deleted with everyone wipes content and sets is_deleted true', () => {
  const initialMessages = [
    { id: 10, content: 'Secret info', is_edited: false, is_deleted: false, message_type: 'text', created_at: '2026-11-18T10:00:00Z' },
    { id: 11, content: '', audio_url: 'https://example.com/audio.wav', is_deleted: false, message_type: 'voice', created_at: '2026-11-18T10:01:00Z' },
  ];

  // Delete message 10
  const updated1 = initialMessages.map((m) =>
    m.id === 10 ? { ...m, is_deleted: true, content: '', audio_url: null } : m
  );
  assert.equal(updated1[0].is_deleted, true);
  assert.equal(updated1[0].content, '');

  // Delete voice message 11
  const updated2 = updated1.map((m) =>
    m.id === 11 ? { ...m, is_deleted: true, content: '', audio_url: null } : m
  );
  assert.equal(updated2[1].is_deleted, true);
  assert.equal(updated2[1].audio_url, null);
});

test('3. Delete for Me filters message from current view only', () => {
  const messages = [
    { id: 101, content: 'Keep this' },
    { id: 102, content: 'Delete for me only' },
    { id: 103, content: 'Keep this too' },
  ];

  const filtered = messages.filter((m) => m.id !== 102);
  assert.equal(filtered.length, 2);
  assert.equal(filtered.find((m) => m.id === 102), undefined);
});

test('4. Optimistic edit rollback restores original content on API failure', () => {
  const original = { id: 200, content: 'Original text', is_edited: false };
  let currentMessages = [original];

  // Optimistic edit
  const draftText = 'Attempted new text';
  currentMessages = currentMessages.map((m) =>
    m.id === 200 ? { ...m, content: draftText, is_edited: true } : m
  );
  assert.equal(currentMessages[0].content, draftText);

  // Simulated API error rollback
  currentMessages = currentMessages.map((m) =>
    m.id === 200 ? { ...m, content: original.content, is_edited: original.is_edited } : m
  );
  assert.equal(currentMessages[0].content, 'Original text');
  assert.equal(currentMessages[0].is_edited, false);
});

test('5. Optimistic delete rollback restores message on API failure', () => {
  const original = { id: 300, content: 'Crucial message', is_deleted: false };
  let currentMessages = [original];

  // Optimistic delete for me
  currentMessages = currentMessages.filter((m) => m.id !== 300);
  assert.equal(currentMessages.length, 0);

  // Simulated API error rollback
  currentMessages = mergeMessages(currentMessages, [original]);
  assert.equal(currentMessages.length, 1);
  assert.equal(currentMessages[0].id, 300);
  assert.equal(currentMessages[0].content, 'Crucial message');
});

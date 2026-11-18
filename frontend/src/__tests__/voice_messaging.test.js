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

import { audioPlayerManager } from '../utils/audioPlayerManager.js';
import { mergeMessages } from '../utils/messageUtils.js';

test('1. AudioPlayerManager coordinates single active playback across messages', () => {
  let player1Paused = false;
  let player2Paused = false;

  // Start playing message 1
  audioPlayerManager.play(101, () => {
    player1Paused = true;
  });
  assert.equal(audioPlayerManager.currentId, 101);
  assert.equal(player1Paused, false);

  // Start playing message 2 -> message 1 must be paused automatically
  audioPlayerManager.play(102, () => {
    player2Paused = true;
  });
  assert.equal(player1Paused, true, 'Previous player must be paused when next player starts');
  assert.equal(audioPlayerManager.currentId, 102);

  // Stop message 2
  audioPlayerManager.stop(102);
  assert.equal(audioPlayerManager.currentId, null);
});

test('2. AudioPlayerManager.stopAll pauses playback on conversation switch or unmount', () => {
  let paused = false;
  audioPlayerManager.play(201, () => {
    paused = true;
  });
  assert.equal(paused, false);

  audioPlayerManager.stopAll();
  assert.equal(paused, true, 'stopAll must invoke the active pause callback');
  assert.equal(audioPlayerManager.currentId, null);
});

test('3. Voice message optimistic state merges cleanly with server response using client_message_id', () => {
  const clientMsgId = 'voice-opt-uuid-777';

  // 1. Optimistic message created by UI while recording finishes/uploads
  const optimisticVoice = [
    {
      id: 'temp-voice-12345',
      client_message_id: clientMsgId,
      message_type: 'voice',
      audio_url: 'blob:http://localhost:5173/mock-audio-blob-123',
      duration_seconds: 6,
      status: 'sending',
      created_at: '2026-11-18T10:00:00Z',
    },
  ];

  // 2. Server responds with persisted record (different numeric id, stable client_message_id)
  const serverResponse = [
    {
      id: 999,
      client_message_id: clientMsgId,
      message_type: 'voice',
      audio_url: '/api/auth/conversations/10/messages/999/audio/',
      duration_seconds: 6,
      status: 'sent',
      created_at: '2026-11-18T10:00:00Z',
    },
  ];

  const merged = mergeMessages(optimisticVoice, serverResponse);

  // Should deduplicate and replace the temporary optimistic message with server message
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 999);
  assert.equal(merged[0].client_message_id, clientMsgId);
  assert.equal(merged[0].status, 'sent');
  assert.equal(merged[0].message_type, 'voice');
  assert.equal(merged[0].audio_url, '/api/auth/conversations/10/messages/999/audio/');
});

test('4. Voice message status updates (sent -> delivered -> seen) preserve voice metadata', () => {
  const existing = [
    {
      id: 50,
      client_message_id: 'voice-msg-50',
      message_type: 'voice',
      audio_url: '/api/auth/conversations/5/messages/50/audio/',
      duration_seconds: 12,
      file_size: 45000,
      audio_format: 'webm',
      status: 'sent',
      created_at: '2026-11-18T09:00:00Z',
    },
  ];

  const incomingSeenUpdate = [
    {
      id: 50,
      client_message_id: 'voice-msg-50',
      message_type: 'voice',
      audio_url: '/api/auth/conversations/5/messages/50/audio/',
      duration_seconds: 12,
      file_size: 45000,
      audio_format: 'webm',
      status: 'seen',
      is_read: true,
      created_at: '2026-11-18T09:00:00Z',
    },
  ];

  const merged = mergeMessages(existing, incomingSeenUpdate);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, 'seen');
  assert.equal(merged[0].is_read, true);
  assert.equal(merged[0].duration_seconds, 12);
  assert.equal(merged[0].audio_format, 'webm');
});

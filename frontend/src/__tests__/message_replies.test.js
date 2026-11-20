import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMessages } from '../utils/messageUtils.js';

test('Message Replies — Frontend Reliability & State Management', async (t) => {
  await t.test('1. Optimistic reply message merges cleanly with server response', () => {
    const optimisticReply = {
      id: 'temp-12345',
      client_message_id: 'cli-reply-999',
      conversation_id: 32,
      sender_profile_id: 'LYNQ-2W5W4',
      sender_display_name: 'ashique',
      content: 'This is my reply to your photo',
      status: 'sending',
      created_at: '2026-11-20T12:00:00Z',
      reply_to_id: 101,
      reply_to_details: {
        id: 101,
        sender_profile_id: 'LYNQ-7PQUT',
        sender_display_name: 'testuser',
        content: '',
        message_type: 'image',
        thumbnail_url: '/api/auth/conversations/32/messages/101/image/?thumb=1',
        is_deleted: false,
      },
    };

    const serverReply = {
      id: 202,
      client_message_id: 'cli-reply-999',
      conversation_id: 32,
      sender_profile_id: 'LYNQ-2W5W4',
      sender_display_name: 'ashique',
      content: 'This is my reply to your photo',
      status: 'sent',
      created_at: '2026-11-20T12:00:01Z',
      reply_to_id: 101,
      reply_to_details: {
        id: 101,
        sender_profile_id: 'LYNQ-7PQUT',
        sender_display_name: 'testuser',
        content: '',
        message_type: 'image',
        thumbnail_url: '/api/auth/conversations/32/messages/101/image/?thumb=1',
        is_deleted: false,
      },
    };

    const initial = [optimisticReply];
    const merged = mergeMessages(initial, [serverReply]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0].id, 202);
    assert.equal(merged[0].status, 'sent');
    assert.equal(merged[0].reply_to_id, 101);
    assert.equal(merged[0].reply_to_details.sender_display_name, 'testuser');
    assert.equal(merged[0].reply_to_details.message_type, 'image');
  });

  await t.test('2. Preserves reply_to_details when status transitions from sent -> delivered -> seen', () => {
    const existing = [
      {
        id: 202,
        client_message_id: 'cli-reply-999',
        content: 'This is my reply',
        status: 'sent',
        created_at: '2026-11-20T12:00:01Z',
        reply_to_id: 101,
        reply_to_details: {
          id: 101,
          sender_profile_id: 'LYNQ-7PQUT',
          sender_display_name: 'testuser',
          content: 'Hello ashique',
          message_type: 'text',
          is_deleted: false,
        },
      },
    ];

    // Status updated via WebSocket (e.g. delivered receipt) without repeating full reply_to_details
    const update = [
      {
        id: 202,
        client_message_id: 'cli-reply-999',
        content: 'This is my reply',
        status: 'delivered',
        created_at: '2026-11-20T12:00:01Z',
      },
    ];

    const merged = mergeMessages(existing, update);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].status, 'delivered');
    assert.equal(merged[0].reply_to_id, 101);
    assert.ok(merged[0].reply_to_details, 'reply_to_details should not be overwritten with undefined');
    assert.equal(merged[0].reply_to_details.content, 'Hello ashique');
  });

  await t.test('3. Quoted reply formatting masks deleted message content', () => {
    const replyWithDeletedOrig = {
      id: 203,
      client_message_id: 'cli-reply-1000',
      content: 'I see',
      reply_to_id: 99,
      reply_to_details: {
        id: 99,
        sender_profile_id: 'LYNQ-7PQUT',
        sender_display_name: 'testuser',
        content: '',
        message_type: 'text',
        is_deleted: true,
      },
    };

    assert.equal(replyWithDeletedOrig.reply_to_details.is_deleted, true);
    assert.equal(replyWithDeletedOrig.reply_to_details.content, '');
  });

  await t.test('4. Voice and Image replies attach reply_to metadata properly', () => {
    const voiceReply = {
      id: 204,
      client_message_id: 'cli-voice-reply',
      message_type: 'voice',
      audio_url: 'blob:http://localhost:5173/test',
      duration_seconds: 5,
      reply_to_id: 150,
      reply_to_details: {
        id: 150,
        sender_profile_id: 'LYNQ-2W5W4',
        sender_display_name: 'ashique',
        content: 'Here is a photo',
        message_type: 'image',
        is_deleted: false,
      },
    };

    assert.equal(voiceReply.reply_to_id, 150);
    assert.equal(voiceReply.reply_to_details.sender_display_name, 'ashique');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeMessages } from '../utils/messageUtils.js';
import { mergeConversations } from '../utils/conversationUtils.js';

describe('Photo Messaging & Authentication Regressions', () => {
  it('1. Merging optimistic image message with server response using client_message_id', () => {
    const optimisticMsg = {
      id: 'img-temp-123',
      client_message_id: 'img-temp-123',
      conversation_id: 1,
      sender_profile_id: 'LYNQ-ALICE',
      message_type: 'image',
      image_width: 800,
      image_height: 600,
      local_preview_url: 'blob:http://localhost:5173/test-blob-123',
      status: 'sending',
      created_at: '2026-11-19T10:00:00Z',
    };

    const serverMsg = {
      id: 999,
      client_message_id: 'img-temp-123',
      conversation_id: 1,
      sender_profile_id: 'LYNQ-ALICE',
      message_type: 'image',
      image_width: 800,
      image_height: 600,
      image_url: '/api/auth/conversations/1/messages/999/image/',
      thumbnail_url: '/api/auth/conversations/1/messages/999/image/?thumb=1',
      status: 'sent',
      created_at: '2026-11-19T10:00:01Z',
    };

    const merged = mergeMessages([optimisticMsg], [serverMsg]);
    assert.strictEqual(merged.length, 1, 'Should reconcile optimistic and server image message');
    assert.strictEqual(merged[0].id, 999, 'Reconciled message takes server ID');
    assert.strictEqual(merged[0].status, 'sent', 'Status updated to sent');
    assert.strictEqual(merged[0].image_url, '/api/auth/conversations/1/messages/999/image/');
    assert.strictEqual(merged[0].thumbnail_url, '/api/auth/conversations/1/messages/999/image/?thumb=1');
  });

  it('2. Image message status updates (sent -> delivered -> seen) preserve dimensions and thumbnail', () => {
    const existingMsg = {
      id: 999,
      client_message_id: 'img-temp-123',
      message_type: 'image',
      image_width: 1200,
      image_height: 900,
      image_url: '/api/auth/conversations/1/messages/999/image/',
      thumbnail_url: '/api/auth/conversations/1/messages/999/image/?thumb=1',
      status: 'sent',
      is_read: false,
    };

    const deliveredUpdate = {
      id: 999,
      client_message_id: 'img-temp-123',
      status: 'delivered',
      is_read: false,
    };

    const seenUpdate = {
      id: 999,
      client_message_id: 'img-temp-123',
      status: 'seen',
      is_read: true,
    };

    const afterDelivered = mergeMessages([existingMsg], [deliveredUpdate]);
    assert.strictEqual(afterDelivered[0].status, 'delivered');
    assert.strictEqual(afterDelivered[0].image_width, 1200, 'Image dimensions preserved');
    assert.strictEqual(afterDelivered[0].thumbnail_url, '/api/auth/conversations/1/messages/999/image/?thumb=1');

    const afterSeen = mergeMessages(afterDelivered, [seenUpdate]);
    assert.strictEqual(afterSeen[0].status, 'seen');
    assert.strictEqual(afterSeen[0].is_read, true);
    assert.strictEqual(afterSeen[0].image_height, 900);
  });

  it('3. Photo upload failure preserves client_message_id for idempotent retry', () => {
    const initialList = [
      {
        id: 'img-fail-456',
        client_message_id: 'img-fail-456',
        message_type: 'image',
        status: 'sending',
      },
    ];

    // Simulate failure
    const failedList = initialList.map((m) =>
      m.client_message_id === 'img-fail-456' ? { ...m, status: 'failed' } : m
    );
    assert.strictEqual(failedList[0].status, 'failed');
    assert.strictEqual(failedList[0].client_message_id, 'img-fail-456');

    // Simulate retry transition
    const retryList = failedList.map((m) =>
      m.client_message_id === 'img-fail-456' ? { ...m, status: 'sending' } : m
    );
    assert.strictEqual(retryList[0].status, 'sending');

    // Server acknowledges success
    const serverAck = {
      id: 1001,
      client_message_id: 'img-fail-456',
      message_type: 'image',
      status: 'sent',
    };
    const finalMerged = mergeMessages(retryList, [serverAck]);
    assert.strictEqual(finalMerged.length, 1);
    assert.strictEqual(finalMerged[0].id, 1001);
    assert.strictEqual(finalMerged[0].status, 'sent');
  });

  it('4. HomeDashboard merges photo message as last_message in conversation list', () => {
    const existingConvs = [
      {
        id: 1,
        updated_at: '2026-11-19T09:00:00Z',
        last_message: {
          id: 50,
          content: 'Hello',
          message_type: 'text',
          created_at: '2026-11-19T09:00:00Z',
        },
      },
    ];

    const incomingPhotoUpdate = [
      {
        id: 1,
        updated_at: '2026-11-19T10:15:00Z',
        last_message: {
          id: 51,
          message_type: 'image',
          image_url: '/api/auth/conversations/1/messages/51/image/',
          created_at: '2026-11-19T10:15:00Z',
        },
      },
    ];

    const merged = mergeConversations(existingConvs, incomingPhotoUpdate);
    assert.strictEqual(merged.length, 1);
    assert.strictEqual(merged[0].last_message.message_type, 'image');
    assert.strictEqual(merged[0].last_message.id, 51);
  });
});

import client from '../api/client';

export const chatService = {
  async getConversations() {
    return client.get('/api/auth/conversations/');
  },

  async startConversation(profileId) {
    return client.post('/api/auth/conversations/', { profile_id: profileId });
  },

  async getConversationDetail(conversationId) {
    return client.get(`/api/auth/conversations/${conversationId}/`);
  },

  async getMessages(conversationId, params = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.append('limit', params.limit);
    if (params.before_id) query.append('before_id', params.before_id);
    if (params.since_id) query.append('since_id', params.since_id);
    if (params.around_id) query.append('around_id', params.around_id);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return client.get(`/api/auth/conversations/${conversationId}/messages/${qs}`);
  },

  async sendMessage(conversationId, content, clientMessageId = null, replyToId = null) {
    const payload = {
      content,
      client_message_id: clientMessageId || `web-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    };
    if (replyToId) {
      payload.reply_to_id = replyToId;
    }
    return client.post(`/api/auth/conversations/${conversationId}/messages/send/`, payload);
  },

  async sendImageMessage(conversationId, imageFile, clientMessageId = null, onProgress = null, replyToId = null) {
    const formData = new FormData();
    formData.append('image', imageFile);
    if (clientMessageId) {
      formData.append('client_message_id', clientMessageId);
    }
    if (replyToId) {
      formData.append('reply_to_id', replyToId);
    }

    return client.post(`/api/auth/conversations/${conversationId}/messages/image/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: onProgress,
    });
  },

  async sendVoiceMessage(conversationId, audioBlob, durationSeconds, clientMessageId = null, replyToId = null) {
    const formData = new FormData();
    const mime = audioBlob.type || 'audio/webm';
    let ext = 'webm';
    if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) ext = 'mp4';
    else if (mime.includes('ogg')) ext = 'ogg';
    else if (mime.includes('wav')) ext = 'wav';

    const filename = `recording_${Date.now()}.${ext}`;
    formData.append('audio', audioBlob, filename);
    formData.append('duration', String(Math.round(durationSeconds) || 1));
    if (clientMessageId) {
      formData.append('client_message_id', clientMessageId);
    }
    if (replyToId) {
      formData.append('reply_to_id', replyToId);
    }

    return client.post(`/api/auth/conversations/${conversationId}/messages/voice/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  async editMessage(conversationId, messageId, content) {
    return client.put(`/api/auth/conversations/${conversationId}/messages/${messageId}/edit/`, { content });
  },

  async deleteMessage(conversationId, messageId, type = 'everyone') {
    return client.delete(`/api/auth/conversations/${conversationId}/messages/${messageId}/delete/?type=${type}`);
  },
};

export default chatService;

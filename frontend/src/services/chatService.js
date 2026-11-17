import client from '../api/client';

export const chatService = {
  async getConversations() {
    return client.get('/api/auth/conversations/');
  },

  async getConversationDetail(conversationId) {
    return client.get(`/api/auth/conversations/${conversationId}/`);
  },

  async getMessages(conversationId, params = {}) {
    const query = new URLSearchParams();
    if (params.limit) query.append('limit', params.limit);
    if (params.before_id) query.append('before_id', params.before_id);
    if (params.since_id) query.append('since_id', params.since_id);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return client.get(`/api/auth/conversations/${conversationId}/messages/${qs}`);
  },

  async sendMessage(conversationId, content, clientMessageId = null) {
    return client.post(`/api/auth/conversations/${conversationId}/messages/send/`, {
      content,
      client_message_id: clientMessageId || `web-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    });
  },
};

export default chatService;

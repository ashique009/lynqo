import client from '../api/client';

export const chatService = {
  async getConversations() {
    return client.get('/api/auth/conversations/');
  },

  async getConversationDetail(conversationId) {
    return client.get(`/api/auth/conversations/${conversationId}/`);
  },

  async getMessages(conversationId) {
    return client.get(`/api/auth/messages/${conversationId}/`);
  },

  async sendMessage(conversationId, content) {
    return client.post('/api/auth/messages/send/', {
      conversation_id: conversationId,
      content: content,
    });
  },

  async sendVoiceMessage(conversationId, audioFile, durationSeconds) {
    const formData = new FormData();
    formData.append('conversation_id', conversationId);
    formData.append('message_type', 'voice');
    formData.append('audio_file', audioFile);
    formData.append('duration_seconds', Math.round(durationSeconds));
    return client.post('/api/auth/messages/send/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  async sendTypingSignal(conversationId) {
    return client.post('/api/auth/messages/typing/', {
      conversation_id: conversationId,
    });
  },

  async getTypingStatus(conversationId) {
    return client.get(`/api/auth/messages/typing-status/${conversationId}/`);
  },

  async editMessage(messageId, content) {
    return client.put(`/api/auth/messages/${messageId}/edit/`, {
      content: content,
    });
  },

  async deleteMessage(messageId) {
    return client.delete(`/api/auth/messages/${messageId}/delete/`);
  },
};
export default chatService;

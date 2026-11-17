import client from '../api/client';

export const connectService = {
  async searchProfile(profileId) {
    return client.get(`/api/auth/profiles/search/?profile_id=${encodeURIComponent(profileId)}`);
  },

  async sendConnectRequest(profileId, reason = 'be_friends') {
    return client.post('/api/auth/connections/request/', {
      profile_id: profileId,
      reason,
    });
  },

  async getIncomingRequests() {
    return client.get('/api/auth/connections/requests/incoming/');
  },

  async getOutgoingRequests() {
    return client.get('/api/auth/connections/requests/outgoing/');
  },

  async acceptRequest(requestId) {
    return client.post(`/api/auth/connections/requests/${requestId}/accept/`);
  },

  async declineRequest(requestId) {
    return client.post(`/api/auth/connections/requests/${requestId}/decline/`);
  },

  async cancelRequest(requestId) {
    return client.post(`/api/auth/connections/requests/${requestId}/cancel/`);
  },

  async getConnectedProfiles() {
    return client.get('/api/auth/connections/');
  },
};

export default connectService;

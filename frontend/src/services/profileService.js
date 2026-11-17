import client from '../api/client';

export const profileService = {
  async createProfile(displayName, profilePictureFile) {
    const formData = new FormData();
    formData.append('display_name', displayName);
    if (profilePictureFile instanceof File) {
      formData.append('profile_picture', profilePictureFile);
    }
    return client.post('/api/auth/profile/create/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  async recoverProfile(recoveryCode) {
    return client.post('/api/auth/profile/recover/', {
      recovery_code: recoveryCode,
    });
  },

  async getProfile() {
    return client.get('/api/auth/profile/me/');
  },

  async updateProfile({ displayName, profilePictureFile }) {
    const formData = new FormData();
    if (displayName) {
      formData.append('display_name', displayName);
    }
    if (profilePictureFile instanceof File) {
      formData.append('profile_picture', profilePictureFile);
    }
    return client.put('/api/auth/profile/update/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  async regenerateRecoveryCode() {
    return client.post('/api/auth/profile/regenerate-recovery-code/');
  },

  async logout() {
    return client.post('/api/auth/profile/logout/');
  },
};

export default profileService;

import client from '../api/client';

export const profileService = {
  async login(username, password) {
    return client.post('/api/auth/login/', {
      username: username?.trim(),
      password: password,
    });
  },

  async createProfile(displayName, profilePictureFile, username = null, password = null) {
    const formData = new FormData();
    formData.append('display_name', displayName);
    if (username) {
      formData.append('username', username.trim());
    }
    if (password) {
      formData.append('password', password);
    }
    if (profilePictureFile instanceof File) {
      formData.append('profile_picture', profilePictureFile);
    }
    return client.post('/api/auth/profile/create/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  async recoverProfile(recoveryCode, username = null, newPassword = null) {
    const payload = {
      recovery_code: recoveryCode?.trim()?.toUpperCase(),
    };
    if (username) {
      payload.username = username.trim();
    }
    if (newPassword) {
      payload.new_password = newPassword;
    }
    return client.post('/api/auth/profile/recover/', payload);
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

  async logoutAll() {
    return client.post('/api/auth/profile/logout-all/');
  },

  async getSessions() {
    return client.get('/api/auth/profile/sessions/');
  },
};

export default profileService;

import client from '../api/client';

export const authService = {
  async signup(fullName, username, email, phone, password, confirmPassword) {
    return client.post('/api/auth/signup/', {
      full_name: fullName,
      username: username,
      email: email,
      phone: phone,
      password: password,
      confirm_password: confirmPassword,
    });
  },

  async login(identifier, password) {
    return client.post('/api/auth/login/', {
      identifier: identifier,
      password: password,
    });
  },

  async logout() {
    return client.post('/api/auth/logout/');
  },

  async forgotPassword(email) {
    return client.post('/api/auth/forgot-password/', { email });
  },

  async resetPassword(token, newPassword) {
    return client.post('/api/auth/reset-password/', {
      token,
      new_password: newPassword,
    });
  },

  async subscribePush(endpoint, keys) {
    return client.post('/api/auth/push/subscribe/', {
      endpoint,
      keys,
    });
  },

  async unsubscribePush(endpoint) {
    return client.post('/api/auth/push/unsubscribe/', {
      endpoint,
    });
  },

  async getOnlineStatus(userId) {
    return client.get(`/api/auth/online-status/${userId}/`);
  },

  async verifyEmail(userId, otpCode) {
    return client.post('/api/auth/verify-email/', {
      user_id: userId,
      otp_code: otpCode,
    });
  },

  async resendOtp(userId) {
    return client.post('/api/auth/resend-otp/', {
      user_id: userId,
    });
  },
};

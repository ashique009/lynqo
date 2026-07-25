import client from '../api/client';

// Helper to convert object into FormData for file upload
const buildProfileFormData = (data) => {
  const formData = new FormData();
  
  Object.keys(data).forEach((key) => {
    if (key === 'profile_picture') {
      // Only append if it's a File object (user selected a new file)
      if (data[key] instanceof File) {
        formData.append('profile_picture', data[key]);
      }
    } else if (data[key] !== undefined && data[key] !== null) {
      formData.append(key, data[key]);
    }
  });
  
  return formData;
};

export const profileService = {
  async getProfileDetail() {
    return client.get('/api/auth/profile/');
  },

  async createProfile(profileData) {
    const formData = buildProfileFormData(profileData);
    return client.post('/api/auth/profile/create/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  async updateProfile(profileData) {
    const formData = buildProfileFormData(profileData);
    return client.put('/api/auth/profile/update/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  async getSuggestions() {
    return client.get('/api/auth/suggestions/');
  },
};
export default profileService;

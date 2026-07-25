import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Token if available
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('lynqo_token');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Parse envelopes and handle global errors
client.interceptors.response.use(
  (response) => {
    // If request succeeded, return the response data directly.
    // The structure will be: { success: boolean, message: string, data: any }
    return response.data;
  },
  (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized (session expired or token deleted)
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      localStorage.removeItem('lynqo_token');
      localStorage.removeItem('lynqo_username');
      // Redirect to login if not already there
      if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup') && window.location.pathname !== '/') {
        window.location.href = '/login?expired=true';
      }
    }

    // Extract detailed error messages from backend custom_exception_handler
    let errorMessage = 'An unexpected error occurred.';
    let errors = null;

    if (error.response && error.response.data) {
      const data = error.response.data;
      errorMessage = data.message || errorMessage;
      errors = data.errors || null;
    } else if (error.message) {
      errorMessage = error.message;
    }

    const customError = {
      message: errorMessage,
      errors: errors,
      status: error.response ? error.response.status : null,
      data: error.response && error.response.data ? error.response.data.data : null,
      originalError: error
    };

    return Promise.reject(customError);
  }
);

export default client;
const API_URL = API_BASE_URL;
export { API_BASE_URL, API_URL };


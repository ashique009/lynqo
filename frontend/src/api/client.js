import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || (
  typeof window !== 'undefined' && window.location.origin.includes(':5173')
    ? 'http://127.0.0.1:8000'
    : ''
);

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Token if available
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('lynqo_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Parse envelopes and handle global errors
client.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const originalRequest = error.config;
    if (error.response && error.response.status === 401 && !originalRequest?._retry) {
      localStorage.removeItem('lynqo_token');
      localStorage.removeItem('lynqo_profile');
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== '/' &&
        !window.location.pathname.startsWith('/recover')
      ) {
        window.location.href = '/?session_expired=true';
      }
    }

    let errorMessage = 'An unexpected error occurred.';
    let errors = null;

    if (error.response && error.response.data) {
      const data = error.response.data;
      errorMessage = data.message || (typeof data === 'string' ? data : errorMessage);
      errors = data.errors || null;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return Promise.reject({
      message: errorMessage,
      errors: errors,
      status: error.response ? error.response.status : null,
      data: error.response && error.response.data ? error.response.data : null,
      originalError: error,
    });
  }
);

export default client;
export { API_BASE_URL, API_BASE_URL as API_URL };


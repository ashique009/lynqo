import axios from 'axios';
import { cacheInvalidate } from '../utils/cache.js';

export const getWindowOrigin = () => {
  if (typeof window === 'undefined') return '';
  if (window.location?.origin) return window.location.origin;
  if (window.location?.protocol && window.location?.hostname) {
    const port = window.location.port ? `:${window.location.port}` : '';
    return `${window.location.protocol}//${window.location.hostname}${port}`;
  }
  return '';
};

const windowOrigin = getWindowOrigin();

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_URL : null) || (
  windowOrigin.includes(':5173')
    ? 'http://127.0.0.1:8001'
    : ''
);

const client = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Helper to determine if a target URL is external (not LYNQO backend)
export const isExternalUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }
  try {
    const targetUrl = new URL(url);
    const targetOrigin = targetUrl.origin;

    // Cloudinary and known third-party media origins are always external
    if (targetUrl.hostname.includes('cloudinary.com')) {
      return true;
    }

    const effectiveBase = API_BASE_URL || getWindowOrigin();
    if (effectiveBase) {
      const baseOrigin = new URL(effectiveBase, 'http://localhost').origin;
      return targetOrigin !== baseOrigin;
    }
    const winOrigin = getWindowOrigin();
    if (winOrigin) {
      return targetOrigin !== winOrigin;
    }
    return true;
  } catch (e) {
    return false;
  }
};

// Request Interceptor: Attach Token if available, ensure credentials sent only to LYNQO backend
client.interceptors.request.use(
  (config) => {
    // If request is directed to an external service (e.g. Cloudinary CDN),
    // strictly strip credentials and Authorization headers to prevent leakage and CORS issues.
    if (isExternalUrl(config.url)) {
      config.withCredentials = false;
      if (config.headers) {
        delete config.headers.Authorization;
      }
      return config;
    }

    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('lynqo_token') : null;
    if (token) {
      config.headers = config.headers || {};
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
    if (error.response && (error.response.status === 401 || error.response.status === 403) && !originalRequest?._retry) {
      localStorage.removeItem('lynqo_token');
      localStorage.removeItem('lynqo_profile');
      cacheInvalidate();
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

// Wrap client.get with transparent in-flight request deduplication
const rawGet = client.get.bind(client);
const inFlightGetMap = new Map();

client.get = function (url, config = {}) {
  // If skipDeduplication is requested, pass directly to rawGet
  if (config.skipDeduplication) {
    return rawGet(url, config);
  }

  const cacheKey = `${url}::${JSON.stringify(config.params || {})}`;
  if (inFlightGetMap.has(cacheKey)) {
    return inFlightGetMap.get(cacheKey);
  }

  const promise = rawGet(url, config).finally(() => {
    inFlightGetMap.delete(cacheKey);
  });

  inFlightGetMap.set(cacheKey, promise);
  return promise;
};

export default client;
export { API_BASE_URL, API_BASE_URL as API_URL };


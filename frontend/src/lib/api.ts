import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { toast } from 'react-hot-toast';

// CSRF token storage
let csrfToken: string | null = null;

// Get CSRF token from cookie
const getCSRFTokenFromCookie = (): string | null => {
  const matches = document.cookie.match(/(?:^|; )csrf-token=([^;]*)/);
  return matches ? decodeURIComponent(matches[1]) : null;
};

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Include cookies in requests
});

// Request interceptor to add auth token and CSRF token
api.interceptors.request.use(
  (config) => {
    // Add auth token
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add CSRF token for state-changing requests
    const method = config.method?.toUpperCase();
    if (method && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      // Try to get CSRF token from cookie first, then from memory
      const currentCsrfToken = getCSRFTokenFromCookie() || csrfToken;
      if (currentCsrfToken) {
        config.headers['X-CSRF-Token'] = currentCsrfToken;
      }
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors and capture CSRF tokens
api.interceptors.response.use(
  (response: AxiosResponse) => {
    // Capture CSRF token from response headers if present
    const newCsrfToken = response.headers['x-csrf-token'];
    if (newCsrfToken) {
      csrfToken = newCsrfToken;
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/admin/login';
    } else if (error.response?.status === 403) {
      toast.error('You do not have permission to perform this action');
    } else if (error.response?.status === 429) {
      const msg = error.response?.data?.error || 'You are sending requests too quickly. Please wait a moment and try again.';
      toast.error(msg);
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again later.');
    } else if (error.response?.data?.error) {
      toast.error(error.response.data.error);
    } else if (error.message) {
      toast.error(error.message);
    }
    
    return Promise.reject(error);
  }
);

export { api };
export default api; 
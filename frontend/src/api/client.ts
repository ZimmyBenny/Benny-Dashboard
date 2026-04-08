import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach Bearer token when present
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — on 401, logout and hard-redirect to /login
// Guarded by a module-level flag to prevent multiple concurrent 401s from
// each triggering a navigation (research Pitfall 5).
let redirecting = false;
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && !redirecting) {
      redirecting = true;
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;

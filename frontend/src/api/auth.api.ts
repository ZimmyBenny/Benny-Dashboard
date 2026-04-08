import apiClient from './client';
import { useAuthStore } from '../store/authStore';

interface LoginResponse { token: string; }

export async function loginRequest(username: string, password: string): Promise<void> {
  try {
    const response = await apiClient.post<LoginResponse>('/auth/login', { username, password });
    if (!response.data?.token) {
      throw new Error('Server returned no token');
    }
    useAuthStore.getState().login(response.data.token);
  } catch (err: unknown) {
    // Normalize axios errors into a user-facing message for the LoginPage.
    // Do NOT let the global 401 interceptor redirect here — it WILL fire on
    // wrong credentials, but since the user is ALREADY on /login the hard redirect
    // is a no-op refresh (acceptable). Re-throw so the form can show a message.
    if (typeof err === 'object' && err && 'response' in err) {
      const response = (err as { response?: { status?: number } }).response;
      if (response?.status === 401) throw new Error('Invalid credentials');
      if (response?.status === 429) throw new Error('Too many login attempts. Try again in 15 minutes.');
      if (response?.status === 400) throw new Error('Username and password are required');
    }
    throw new Error('Login failed. Is the server running?');
  }
}

export async function logoutRequest(): Promise<void> {
  try {
    await apiClient.post('/auth/logout');
  } catch {
    // Ignore server errors — logout is always best-effort client-side.
  } finally {
    useAuthStore.getState().logout();
  }
}

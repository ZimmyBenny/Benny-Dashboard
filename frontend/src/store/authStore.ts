import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      login: (token) => set({ token }),
      logout: () => set({ token: null }),
    }),
    {
      name: 'benny-auth',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

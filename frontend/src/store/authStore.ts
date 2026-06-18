import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  pinGateToken: string | null;
  login: (token: string) => void;
  logout: () => void;
  setPinGateToken: (t: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      pinGateToken: null,
      login: (token) => set({ token }),
      logout: () => set({ token: null, pinGateToken: null }),
      setPinGateToken: (t) => set({ pinGateToken: t }),
    }),
    {
      name: 'benny-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token }), // pinGateToken NICHT persistieren
    }
  )
);

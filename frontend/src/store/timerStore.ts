import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type TimerStatus = 'idle' | 'running' | 'paused';

interface TimerState {
  status: TimerStatus;
  startedAt: number | null;    // Unix-ms, wann zuletzt gestartet/fortgesetzt
  accumulatedMs: number;       // ms aus vorherigen Lauf-Segmenten
  sessionStartedAt: number | null; // Unix-ms, wann die gesamte Session gestartet wurde

  // Actions
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => { totalMs: number; sessionStartedAt: number | null };
  reset: () => void;
  getElapsedMs: () => number;
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      status: 'idle',
      startedAt: null,
      accumulatedMs: 0,
      sessionStartedAt: null,

      start: () => {
        const now = Date.now();
        set({
          status: 'running',
          startedAt: now,
          accumulatedMs: 0,
          sessionStartedAt: now,
        });
      },

      pause: () => {
        const { startedAt, accumulatedMs } = get();
        const elapsed = startedAt ? Date.now() - startedAt : 0;
        set({
          status: 'paused',
          startedAt: null,
          accumulatedMs: accumulatedMs + elapsed,
          // sessionStartedAt bleibt unveraendert
        });
      },

      resume: () => set((state) => ({
        status: 'running',
        startedAt: Date.now(),
        accumulatedMs: state.accumulatedMs,
        // sessionStartedAt bleibt unveraendert
      })),

      stop: () => {
        const { startedAt, accumulatedMs, sessionStartedAt } = get();
        const elapsed = startedAt ? Date.now() - startedAt : 0;
        const total = accumulatedMs + elapsed;
        set({ status: 'idle', startedAt: null, accumulatedMs: 0, sessionStartedAt: null });
        return { totalMs: total, sessionStartedAt };
      },

      reset: () => set({ status: 'idle', startedAt: null, accumulatedMs: 0, sessionStartedAt: null }),

      getElapsedMs: () => {
        const { status, startedAt, accumulatedMs } = get();
        if (status === 'running' && startedAt) {
          return accumulatedMs + (Date.now() - startedAt);
        }
        return accumulatedMs;
      },
    }),
    {
      name: 'benny-timer',
      storage: createJSONStorage(() => localStorage),
      // Nur persistente Felder — Actions werden neu hydratisiert
      // sessionStartedAt wird NICHT persistiert (nur waehrend einer Session benoetigt)
      partialize: (state) => ({
        status: state.status,
        startedAt: state.startedAt,
        accumulatedMs: state.accumulatedMs,
      }),
    }
  )
);

import { useEffect, useState } from 'react';
import { useIsMutating, useMutationState } from '@tanstack/react-query';

interface ErrorEntry { at: number; message: string; }

function describeError(err: unknown): string {
  if (!err) return 'unbekannter Fehler';
  if (typeof err === 'string') return err;
  const e = err as { response?: { status?: number; data?: unknown }; message?: string; code?: string };
  if (e.response) {
    const status = e.response.status ?? '?';
    const data = e.response.data;
    let detail = '';
    if (typeof data === 'string') detail = data;
    else if (data && typeof data === 'object' && 'error' in data) {
      detail = String((data as { error: unknown }).error);
    }
    return detail ? `HTTP ${status}: ${detail}` : `HTTP ${status}`;
  }
  if (e.code === 'ERR_NETWORK') return 'Backend nicht erreichbar';
  if (e.message) return e.message;
  return JSON.stringify(err).slice(0, 200);
}

export function AutosaveIndicator() {
  const isMutating = useIsMutating() > 0;

  const errorEntries = useMutationState<ErrorEntry>({
    filters: { status: 'error' },
    select: (m) => ({ at: m.state.submittedAt, message: describeError(m.state.error) }),
  });
  const latest = errorEntries.length > 0
    ? errorEntries.reduce((acc, e) => (e.at > acc.at ? e : acc), errorEntries[0])
    : { at: 0, message: '' };
  const latestErrorAt = latest.at;

  const [lastSeenError, setLastSeenError] = useState(latestErrorAt);
  const [showError, setShowError] = useState(false);
  const [currentMessage, setCurrentMessage] = useState('');
  const [showSaved, setShowSaved] = useState(false);

  // Neue Fehler-Mutation → rote Anzeige fuer 8 s
  useEffect(() => {
    if (latestErrorAt > lastSeenError) {
      setLastSeenError(latestErrorAt);
      setCurrentMessage(latest.message);
      setShowError(true);
      const t = setTimeout(() => setShowError(false), 8000);
      return () => clearTimeout(t);
    }
  }, [latestErrorAt, lastSeenError, latest.message]);

  // Mutation gerade fertig (ohne neuen Fehler) → "Gespeichert" fuer 1.5 s
  useEffect(() => {
    if (isMutating || showError) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1500);
    return () => clearTimeout(t);
  }, [isMutating, showError]);

  if (isMutating) {
    return (
      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined text-base animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
        Speichere …
      </p>
    );
  }
  if (showError) {
    return (
      <p className="text-xs flex items-center gap-1" style={{ color: '#fca5a5' }}>
        <span className="material-symbols-outlined text-base" style={{ fontSize: '14px' }}>error</span>
        Speichern fehlgeschlagen — {currentMessage || 'Backend nicht erreichbar?'}
      </p>
    );
  }
  if (showSaved) {
    return (
      <p className="text-xs flex items-center gap-1" style={{ color: '#34d399' }}>
        <span className="material-symbols-outlined text-base" style={{ fontSize: '14px' }}>check</span>
        Gespeichert
      </p>
    );
  }
  return (
    <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>
      Änderungen werden automatisch gespeichert
    </p>
  );
}

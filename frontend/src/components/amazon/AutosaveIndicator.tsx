import { useEffect, useState } from 'react';
import { useIsMutating, useMutationState } from '@tanstack/react-query';

export function AutosaveIndicator() {
  const isMutating = useIsMutating() > 0;

  // Beobachte alle Mutationen im Fehler-Status und merke den Zeitstempel
  const errorTimes = useMutationState({
    filters: { status: 'error' },
    select: (m) => m.state.submittedAt,
  });
  const latestErrorAt = errorTimes.length > 0 ? Math.max(...errorTimes) : 0;

  const [lastSeenError, setLastSeenError] = useState(latestErrorAt);
  const [showError, setShowError] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  // Neue Fehler-Mutation → rote Anzeige fuer 5 s
  useEffect(() => {
    if (latestErrorAt > lastSeenError) {
      setLastSeenError(latestErrorAt);
      setShowError(true);
      const t = setTimeout(() => setShowError(false), 5000);
      return () => clearTimeout(t);
    }
  }, [latestErrorAt, lastSeenError]);

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
        Speichern fehlgeschlagen — Backend nicht erreichbar?
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

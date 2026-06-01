import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';

export function AutosaveIndicator() {
  const mutatingCount = useIsMutating({ mutationKey: undefined });
  const isMutating = mutatingCount > 0;
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (isMutating) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1500);
    return () => clearTimeout(t);
  }, [isMutating]);

  if (isMutating) {
    return (
      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined text-base animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
        Speichere …
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
      Aenderungen werden automatisch gespeichert
    </p>
  );
}

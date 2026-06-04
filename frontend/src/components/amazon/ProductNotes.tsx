import { useEffect, useRef, useState } from 'react';
import { useUpdateAmazonProductNotes } from '../../hooks/amazon/useAmazonProducts';

interface Props {
  productId: number;
  initialNotes: string | null;
}

const AUTOSAVE_DELAY_MS = 600;
const MAX_NOTES = 5000;

export function ProductNotes({ productId, initialNotes }: Props) {
  const update = useUpdateAmazonProductNotes();
  const [value, setValue] = useState<string>(initialNotes ?? '');
  const lastSavedRef = useRef<string>(initialNotes ?? '');
  const timerRef = useRef<number | null>(null);

  // Setze den Initialwert nur bei Produkt-Wechsel — nicht bei jedem Refetch,
  // sonst wuerde der User-Input ueberschrieben waehrend des Tippens.
  useEffect(() => {
    setValue(initialNotes ?? '');
    lastSavedRef.current = initialNotes ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function persist(next: string) {
    if (next === lastSavedRef.current) return;
    lastSavedRef.current = next;
    const trimmed = next.trim();
    update.mutate({ id: productId, notes: trimmed.length === 0 ? null : next });
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      persist(next);
    }, AUTOSAVE_DELAY_MS);
  }

  function onBlur() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    persist(value);
  }

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  return (
    <section
      className="flex flex-col gap-2 flex-1 min-w-0"
    >
      <label
        className="text-xs font-medium"
        style={{ color: 'var(--color-on-surface-variant)' }}
      >
        Notizen
      </label>
      <textarea
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        maxLength={MAX_NOTES}
        placeholder="Freier Notizbereich — Ideen, Beobachtungen, To-dos …"
        spellCheck={false}
        className="w-full flex-1 rounded-lg px-3 py-2 text-sm resize-none"
        style={{
          minHeight: '180px',
          background: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'inherit',
          lineHeight: '1.5',
        }}
      />
      <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
        Wird automatisch gespeichert.
      </p>
    </section>
  );
}

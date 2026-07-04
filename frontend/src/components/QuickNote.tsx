import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQuickNote, saveQuickNote } from '../api/quicknote.api';

/**
 * QuickNote — globales Scratchpad am Fuß der Dashboards.
 * Ein Textfeld, Auto-Speichern (entprellt ~700ms + beim Verlassen),
 * gespeichert im app_settings-Key 'quick_note'. Reibungslos, kein Button.
 */
export function QuickNote() {
  const { data } = useQuery({ queryKey: ['quick-note'], queryFn: getQuickNote, staleTime: 60_000 });
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Einmalig mit geladenem Wert initialisieren
  useEffect(() => {
    if (data !== undefined && text === null) setText(data);
  }, [data, text]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function scheduleSave(v: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      saveQuickNote(v).then(() => setSaved(true)).catch(() => {});
    }, 700);
  }

  function handleChange(v: string) {
    setText(v);
    setSaved(false);
    scheduleSave(v);
  }

  function handleBlur() {
    if (timer.current) clearTimeout(timer.current);
    if (text !== null) saveQuickNote(text).then(() => setSaved(true)).catch(() => {});
  }

  return (
    <div style={{ marginTop: '2.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-body)', fontSize: '0.65rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-outline)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem', color: 'var(--color-primary)' }}>edit_note</span>
          Schnelle Notiz
        </span>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--color-outline-variant) 0%, transparent 100%)' }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: saved ? 'var(--color-outline)' : 'var(--color-primary)', transition: 'color 150ms ease' }}>
          {saved ? 'gespeichert' : 'speichert…'}
        </span>
      </div>
      <div style={{ background: 'var(--color-surface-container)', border: '1px solid var(--color-outline-variant)', borderRadius: '0.75rem', padding: '0.35rem' }}>
        <textarea
          value={text ?? ''}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Kurz was aufschreiben, damit du's nicht vergisst…"
          rows={3}
          style={{
            width: '100%', resize: 'vertical', minHeight: '72px', boxSizing: 'border-box',
            border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--color-on-surface)', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
            lineHeight: 1.55, padding: '0.6rem 0.75rem',
          }}
        />
      </div>
    </div>
  );
}

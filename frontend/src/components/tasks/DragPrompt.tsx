import { useState, useEffect } from 'react';

interface DragPromptProps {
  fromCol: string;
  toCol: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

export function DragPrompt({ fromCol, toCol, onConfirm, onCancel }: DragPromptProps) {
  const [note, setNote] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 60,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 61,
          background: 'var(--color-surface-container)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '1rem',
          padding: '1.5rem',
          width: 'min(420px, 90vw)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* Titel */}
        <div>
          <p style={{
            fontFamily: 'var(--font-headline)',
            fontWeight: 700,
            fontSize: '0.9rem',
            color: 'var(--color-on-surface)',
            marginBottom: '0.25rem',
          }}>
            Status geaendert: {fromCol} &rarr; {toCol}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'var(--color-on-surface-variant)',
          }}>
            Wartet auf / Naechster Schritt (optional)
          </p>
        </div>

        {/* Textarea */}
        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="z.B. Wartet auf Rueckmeldung von..."
          style={{
            width: '100%',
            background: 'var(--color-surface-container-low)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem',
            color: 'var(--color-on-surface)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.875rem',
            padding: '0.5rem 0.75rem',
            outline: 'none',
            boxSizing: 'border-box',
            resize: 'vertical',
          }}
        />

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '9999px',
              background: 'transparent',
              border: '1px solid var(--color-outline-variant)',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Abbrechen
          </button>
          <button
            onClick={() => onConfirm(note)}
            style={{
              padding: '0.5rem 1.25rem',
              borderRadius: '9999px',
              background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
              border: 'none',
              color: '#000',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Bestätigen
          </button>
        </div>
      </div>
    </>
  );
}

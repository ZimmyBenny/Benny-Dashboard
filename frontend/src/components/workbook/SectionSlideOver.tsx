import { useEffect, useState } from 'react';
import { createSection, updateSection, type Section } from '../../api/workbook.api';

interface SectionSlideOverProps {
  editSection?: Section | null;
  onClose: () => void;
  onSaved: () => void;
}

const COLOR_OPTIONS = [
  { label: 'Primary', value: 'var(--color-primary)' },
  { label: 'Secondary', value: 'var(--color-secondary)' },
  { label: 'Error', value: 'var(--color-error)' },
  { label: 'Outline', value: 'var(--color-outline)' },
];

export function SectionSlideOver({ editSection, onClose, onSaved }: SectionSlideOverProps) {
  const [name, setName] = useState(editSection?.name ?? '');
  const [icon, setIcon] = useState(editSection?.icon ?? 'folder');
  const [color, setColor] = useState(editSection?.color ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSave() {
    if (!name.trim()) { setError('Name ist erforderlich'); return; }
    setSaving(true);
    setError('');
    try {
      if (editSection) {
        await updateSection(editSection.id, { name, icon, color: color || undefined });
      } else {
        await createSection({ name, icon, color: color || undefined });
      }
      onSaved();
      onClose();
    } catch {
      setError('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Floating Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(420px, 92vw)',
          zIndex: 9001,
          background: 'var(--color-surface-container)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '0.75rem',
          boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem',
          gap: '1rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
            {editSection ? 'Sektion bearbeiten' : 'Neue Sektion'}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: '0.25rem' }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Name */}
        <div>
          <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.35rem' }}>
            Name *
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="z.B. Arbeit"
            style={{
              width: '100%',
              padding: '0.6rem 0.75rem',
              background: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '0.4rem',
              color: 'var(--color-on-surface)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Icon */}
        <div>
          <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.35rem' }}>
            Icon (Material Symbols Name)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="folder"
              style={{
                flex: 1,
                padding: '0.6rem 0.75rem',
                background: 'var(--color-surface-container)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '0.4rem',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
            <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-on-surface-variant)' }}>
              {icon || 'folder'}
            </span>
          </div>
        </div>

        {/* Color */}
        <div>
          <label style={{ display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem' }}>
            Farbe
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {COLOR_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setColor(color === opt.value ? '' : opt.value)}
                title={opt.label}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: opt.value,
                  border: color === opt.value ? '2px solid white' : '2px solid transparent',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-error)', margin: 0 }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '0.65rem',
              background: 'transparent',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '0.4rem',
              color: 'var(--color-on-surface-variant)',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
            }}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              padding: '0.65rem',
              background: 'var(--color-primary)',
              border: 'none',
              borderRadius: '0.4rem',
              color: 'var(--color-on-primary)',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              fontWeight: 600,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </>
  );
}

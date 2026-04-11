import { useEffect, useState } from 'react';
import { fetchTemplates, type Template } from '../../api/workbook.api';

interface TemplatePickerModalProps {
  onClose: () => void;
  onCreate: (template_id: number | null) => Promise<void>;
}

export function TemplatePickerModal({ onClose, onCreate }: TemplatePickerModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSelect(template_id: number | null) {
    if (creating) return;
    setCreating(true);
    try {
      await onCreate(template_id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(600px, 92vw)',
          maxHeight: '80vh',
          background: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '1rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-outline-variant)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
            Vorlage auswählen
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {loading && (
            <p style={{ fontFamily: 'var(--font-body)', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
              Vorlagen laden...
            </p>
          )}

          {/* Empty page option */}
          <TemplateCard
            name="Leere Seite"
            description="Starte mit einem leeren Dokument"
            icon="note_add"
            onClick={() => handleSelect(null)}
            disabled={creating}
          />

          {/* Template options */}
          {templates.map((tmpl) => (
            <TemplateCard
              key={tmpl.id}
              name={tmpl.name}
              description={tmpl.description ?? ''}
              icon="note_alt"
              onClick={() => handleSelect(tmpl.id)}
              disabled={creating}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TemplateCard({
  name,
  description,
  icon,
  onClick,
  disabled,
}: {
  name: string;
  description: string;
  icon: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.9rem 1rem',
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '0.5rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s, border-color 0.15s',
        opacity: disabled ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLButtonElement).style.background = 'rgba(204,151,255,0.08)';
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-primary)';
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-outline-variant)';
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)', flexShrink: 0 }}>
        {icon}
      </span>
      <div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
          {name}
        </div>
        {description && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--color-on-surface-variant)', marginTop: '0.15rem' }}>
            {description}
          </div>
        )}
      </div>
    </button>
  );
}

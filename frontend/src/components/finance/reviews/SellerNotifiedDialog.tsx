import { useEffect } from 'react';

interface Props {
  productName: string;
  onYes: () => void;       // Bewertet + seller_notified=1
  onNotYet: () => void;    // Bewertet, seller_notified bleibt 0
  onCancel: () => void;    // kein Status-Wechsel
}

export function SellerNotifiedDialog({ productName, onYes, onNotYet, onCancel }: Props) {
  // Esc -> cancel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.55)',
      zIndex: 1100,
    }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(460px, 92vw)',
          background: 'var(--color-surface-container)',
          borderRadius: '1rem',
          boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
          border: '1px solid rgba(148,170,255,0.18)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '0.5rem',
            background: 'rgba(148,170,255,0.12)',
            border: '1px solid rgba(148,170,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#94aaff' }}>
              rate_review
            </span>
          </div>
          <h3 style={{
            margin: 0,
            fontFamily: 'var(--font-headline)',
            fontWeight: 800,
            fontSize: '1.05rem',
            color: 'var(--color-on-surface)',
          }}>
            Bewertung geschrieben?
          </h3>
        </div>

        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          color: 'var(--color-on-surface-variant)',
          lineHeight: 1.5,
        }}>
          <p style={{ margin: '0 0 0.5rem' }}>
            Du wechselst <strong style={{ color: 'var(--color-on-surface)' }}>„{productName}"</strong> auf <strong style={{ color: 'var(--color-on-surface)' }}>Bewertet</strong>.
          </p>
          <p style={{ margin: 0 }}>
            Hast du den Verkäufer schon informiert? Die Freigabe durch Amazon dauert meist 1–2 Tage.
          </p>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          marginTop: '0.25rem',
        }}>
          <button
            type="button"
            onClick={onYes}
            style={{
              background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
              color: '#060e20',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 0 14px rgba(148,170,255,0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.375rem',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>mark_email_read</span>
            Ja, gesendet
          </button>
          <button
            type="button"
            onClick={onNotYet}
            style={{
              background: 'transparent',
              color: 'var(--color-on-surface)',
              border: '1px solid var(--color-outline)',
              borderRadius: '0.5rem',
              padding: '0.625rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Noch nicht
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              background: 'transparent',
              color: 'var(--color-on-surface-variant)',
              border: 'none',
              padding: '0.375rem 1rem',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              marginTop: '0.25rem',
            }}
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

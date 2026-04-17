import { useEffect } from 'react';

interface Props {
  pdfUrl: string;
  onClose: () => void;
  onDownload: () => void;
  logoUrl: string | null;
}

export function PdfPreviewModal({ pdfUrl, onClose, onDownload, logoUrl }: Props) {
  // ESC-Taste schließt Modal
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  };

  const panelStyle: React.CSSProperties = {
    background: 'rgba(10,14,32,0.97)',
    border: '1px solid rgba(148,170,255,0.2)',
    borderRadius: '0.75rem',
    width: '100%',
    maxWidth: '1200px',
    height: '90vh',
    display: 'flex',
    overflow: 'hidden',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  };

  const btnPrimary: React.CSSProperties = {
    background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#060e20',
    padding: '0.625rem 1.25rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    width: '100%',
    justifyContent: 'center',
  };

  const btnSecondary: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(148,170,255,0.2)',
    borderRadius: '0.5rem',
    color: 'var(--color-on-surface)',
    padding: '0.625rem 1.25rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    width: '100%',
    justifyContent: 'center',
  };

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
    >
      {/* Panel fängt Klicks ab */}
      <div
        style={panelStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Linke Seite — PDF iframe */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <iframe
            src={pdfUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#fff',
              borderRadius: '0.75rem 0 0 0.75rem',
            }}
            title="PDF-Vorschau"
          />
        </div>

        {/* Rechte Seite — Steuerung */}
        <div style={{
          width: '280px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem',
          borderLeft: '1px solid rgba(148,170,255,0.1)',
          gap: '1.25rem',
        }}>
          {/* Titel */}
          <div>
            <h2 style={{
              fontFamily: 'var(--font-headline)',
              fontSize: '1.125rem',
              fontWeight: 700,
              color: 'var(--color-on-surface)',
              margin: 0,
              letterSpacing: '-0.01em',
            }}>
              Vorschau
            </h2>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              color: 'var(--color-on-surface-variant)',
              margin: '0.25rem 0 0',
            }}>
              ESC oder Klick außerhalb zum Schließen
            </p>
          </div>

          {/* Logo-Thumbnail */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(148,170,255,0.1)',
            borderRadius: '0.5rem',
            padding: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '80px',
          }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Firmenlogo"
                style={{ maxWidth: '100%', maxHeight: '70px', objectFit: 'contain' }}
                onError={e => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                  const placeholder = e.currentTarget.nextSibling as HTMLElement | null;
                  if (placeholder) placeholder.style.display = 'flex';
                }}
              />
            ) : null}
            <div style={{
              display: logoUrl ? 'none' : 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.375rem',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.75rem',
              textAlign: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', opacity: 0.5 }}>image_not_supported</span>
              Kein Logo hinterlegt — in Einstellungen hochladen
            </div>
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Aktions-Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            <button type="button" style={btnPrimary} onClick={onDownload}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>download</span>
              PDF herunterladen
            </button>
            <button type="button" style={btnSecondary} onClick={onClose}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>close</span>
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

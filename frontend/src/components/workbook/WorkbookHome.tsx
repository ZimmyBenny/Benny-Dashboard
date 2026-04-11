import { useEffect, useState } from 'react';
import { fetchRecent, fetchRecentlyVisited, type Page } from '../../api/workbook.api';

interface WorkbookHomeProps {
  onOpenPage: (id: number) => void;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
  } catch {
    return '';
  }
}

function PageCard({ page, onClick }: { page: Page; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '0.75rem 1rem',
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '0.5rem',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s, border-color 0.15s',
        marginBottom: '0.5rem',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container-high)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-outline)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container)';
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-outline-variant)';
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.9rem',
          fontWeight: 600,
          color: 'var(--color-on-surface)',
          marginBottom: '0.25rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {page.title || 'Unbenannte Seite'}
      </div>
      {page.excerpt && (
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.78rem',
            color: 'var(--color-on-surface-variant)',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            marginBottom: '0.25rem',
          }}
        >
          {page.excerpt}
        </div>
      )}
      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-outline)' }}>
        {formatDate(page.updated_at)}
      </div>
    </button>
  );
}

export function WorkbookHome({ onOpenPage }: WorkbookHomeProps) {
  const [recent, setRecent] = useState<Page[]>([]);
  const [visited, setVisited] = useState<Page[]>([]);

  useEffect(() => {
    fetchRecent().then(setRecent).catch(() => {});
    fetchRecentlyVisited().then(setVisited).catch(() => {});
  }, []);

  const isEmpty = recent.length === 0 && visited.length === 0;

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '2.5rem 2rem',
        background: 'var(--color-surface)',
      }}
    >
      {isEmpty ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: '1rem',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-outline)' }}>
            menu_book
          </span>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', textAlign: 'center' }}>
            Noch keine Seiten. Lege in der mittleren Spalte eine neue Seite an.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '2rem',
            maxWidth: '900px',
          }}
        >
          {recent.length > 0 && (
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-headline)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-on-surface-variant)',
                  marginBottom: '1rem',
                }}
              >
                Zuletzt bearbeitet
              </h2>
              {recent.map((p) => (
                <PageCard key={p.id} page={p} onClick={() => onOpenPage(p.id)} />
              ))}
            </div>
          )}

          {visited.length > 0 && (
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-headline)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--color-on-surface-variant)',
                  marginBottom: '1rem',
                }}
              >
                Zuletzt besucht
              </h2>
              {visited.map((p) => (
                <PageCard key={p.id} page={p} onClick={() => onOpenPage(p.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

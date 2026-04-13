import { useEffect, useState } from 'react';
import { searchWorkbook, type SearchResult } from '../../api/workbook.api';
import { useDraggableModal } from '../../hooks/useDraggableModal';

interface WorkbookSearchProps {
  onClose: () => void;
  onNavigate: (pageId: number) => void;
}

export function WorkbookSearch({ onClose, onNavigate }: WorkbookSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchWorkbook(query);
        setResults(r);
        setSelectedIndex(0);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        onNavigate(results[selectedIndex].id);
        return;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [results, selectedIndex, onClose, onNavigate]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
      }}
    >
      <div
        data-draggable-modal
        className="workbook-search"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 92vw)',
          maxHeight: '70vh',
          background: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '1rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ...modalStyle,
        }}
      >
        {/* Search input — drag handle */}
        <div
          onMouseDown={onMouseDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-outline-variant)',
            ...headerStyle,
          }}
        >
          <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', fontSize: '1.25rem', flexShrink: 0 }}>
            search
          </span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder="Seiten durchsuchen..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--color-on-surface)',
              fontFamily: 'var(--font-body)',
              fontSize: '1rem',
              cursor: 'text',
            }}
          />
          {loading && (
            <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.75rem' }}>...</span>
          )}
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!query.trim() && (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
              }}
            >
              Cmd+K — tippe um zu suchen
            </div>
          )}

          {query.trim() && !loading && results.length === 0 && (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
              }}
            >
              Nichts gefunden für "{query}"
            </div>
          )}

          {results.map((result, i) => (
            <button
              key={result.id}
              onClick={() => onNavigate(result.id)}
              style={{
                width: '100%',
                padding: '0.85rem 1.25rem',
                background: i === selectedIndex ? 'rgba(204,151,255,0.1)' : 'transparent',
                borderTop: 'none',
                borderRight: 'none',
                borderBottom: '1px solid var(--color-outline-variant)',
                borderLeft: i === selectedIndex ? '3px solid var(--color-primary)' : '3px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.25rem' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: 'var(--color-on-surface)',
                  }}
                >
                  {result.title}
                </span>
                {result.section_name && (
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.72rem',
                      color: 'var(--color-on-surface-variant)',
                      marginLeft: '0.5rem',
                      flexShrink: 0,
                    }}
                  >
                    {result.section_name}
                  </span>
                )}
              </div>
              {result.snippet && (
                <div
                  // Backend returns <mark>…</mark> tags for highlighted matches
                  // eslint-disable-next-line react/no-danger
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.78rem',
                    color: 'var(--color-on-surface-variant)',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

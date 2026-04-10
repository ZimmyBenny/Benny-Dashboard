import { useState, useEffect, useRef } from 'react';

const AREAS = ['DJ', 'Amazon', 'Finanzen', 'KI-Agenten', 'Privat', 'Sonstiges'];

const SELECT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: '0.5rem',
  color: 'var(--color-on-surface)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.8125rem',
  padding: '0.5rem 0.75rem',
  outline: 'none',
  cursor: 'pointer',
};

interface TaskFiltersProps {
  onFilterChange: (filters: { search: string; area: string; priority: string }) => void;
  onNewTask: () => void;
}

export function TaskFilters({ onFilterChange, onNewTask }: TaskFiltersProps) {
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('');
  const [priority, setPriority] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onFilterChange({ search, area, priority });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Immediate for dropdowns
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onFilterChange({ search, area, priority });
  }, [area, priority]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: '0.75rem',
      marginBottom: '1.25rem',
    }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '360px' }}>
        <span className="material-symbols-outlined" style={{
          position: 'absolute',
          left: '0.625rem',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '16px',
          color: 'var(--color-outline)',
          pointerEvents: 'none',
        }}>
          search
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Aufgaben durchsuchen..."
          style={{
            width: '100%',
            background: 'var(--color-surface-container)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem',
            color: 'var(--color-on-surface)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            padding: '0.5rem 0.75rem 0.5rem 2.25rem',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Area filter */}
      <select
        value={area}
        onChange={(e) => setArea(e.target.value)}
        style={SELECT_STYLE}
      >
        <option value="">Alle Bereiche</option>
        {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
      </select>

      {/* Priority filter */}
      <select
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        style={SELECT_STYLE}
      >
        <option value="">Alle Prioritaeten</option>
        <option value="urgent">Dringend</option>
        <option value="high">Hoch</option>
        <option value="medium">Mittel</option>
        <option value="low">Niedrig</option>
      </select>

      {/* Reset filters */}
      {(search || area || priority) && (
        <button
          onClick={() => { setSearch(''); setArea(''); setPriority(''); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.5rem 0.875rem',
            borderRadius: '0.5rem',
            background: 'transparent',
            border: '1px solid var(--color-outline-variant)',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>filter_list_off</span>
          Filter zurücksetzen
        </button>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* New task button */}
      <button
        onClick={onNewTask}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          padding: '0.5rem 1.25rem',
          borderRadius: '9999px',
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
          border: 'none',
          color: '#000',
          fontFamily: 'var(--font-body)',
          fontWeight: 700,
          fontSize: '0.8125rem',
          letterSpacing: '0.03em',
          cursor: 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
        Neue Aufgabe
      </button>
    </div>
  );
}

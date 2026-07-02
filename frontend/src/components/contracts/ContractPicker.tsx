/**
 * ContractPicker — Such-Picker für Verträge (Feature 3, Plan quick-260702-vz7).
 *
 * Muster: `workbook/ContactPicker.tsx`. Debounced Suche über fetchContracts,
 * Dropdown-Liste (Titel + provider_name/area als Sub-Zeile). Kein
 * freischwebendes Modal → Draggable-Modal-Regel (Memory feedback_draggable_modals)
 * ist hier nicht relevant, nur Outside-Click-Schließen.
 */
import { useEffect, useRef, useState } from 'react';
import { fetchContracts, type Contract } from '../../api/contracts.api';

interface ContractPickerProps {
  onSelect: (contract: Contract) => void;
}

export function ContractPicker({ onSelect }: ContractPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced Vertrags-Suche
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      fetchContracts({ search, limit: 20 })
        .then((res) => setContracts(res.data))
        .catch(() => setContracts([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, open]);

  // Schließen bei Klick außerhalb
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleSelect(contract: Contract) {
    onSelect(contract);
    setOpen(false);
    setSearch('');
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) setSearch('');
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.375rem',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(148,170,255,0.2)',
          borderRadius: '0.5rem',
          padding: '0.5rem 0.875rem',
          color: 'var(--color-on-surface)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          cursor: 'pointer',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>search</span>
        Bestehenden Vertrag wählen
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 10,
            width: '320px',
            background: 'var(--color-surface-container-high, var(--color-surface-variant))',
            border: '1px solid rgba(148,170,255,0.2)',
            borderRadius: '0.5rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(148,170,255,0.15)' }}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Vertrag suchen…"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--color-on-surface)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
            {loading && (
              <div style={{ padding: '0.75rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
                Lädt…
              </div>
            )}
            {!loading && contracts.length === 0 && (
              <div style={{ padding: '0.75rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
                Keine Verträge gefunden
              </div>
            )}
            {contracts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c)}
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.1rem',
                  padding: '0.5rem 0.75rem',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid rgba(148,170,255,0.1)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(148,170,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                  {c.title}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>
                  {[c.provider_name, c.area].filter(Boolean).join(' · ') || '—'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

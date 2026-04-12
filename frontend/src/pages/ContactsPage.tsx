import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import {
  fetchContacts,
  exportCsv,
  triggerDownload,
  type Contact,
  type ContactListResponse,
} from '../api/contacts.api';

// ---------------------------------------------------------------------------
// Farben fuer Bereich-Badges
// ---------------------------------------------------------------------------
const AREA_COLORS: Record<string, string> = {
  DJ: '#cc97ff',
  Amazon: '#ff9900',
  Cashback: '#4ade80',
  Finanzen: '#60a5fa',
  Privat: '#f472b6',
  Sonstiges: 'rgba(255,255,255,0.2)',
};

function getAreaColor(area: string): string {
  return AREA_COLORS[area] ?? AREA_COLORS['Sonstiges'];
}

// ---------------------------------------------------------------------------
// Badge-Komponente
// ---------------------------------------------------------------------------
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.15rem 0.5rem',
      borderRadius: '999px',
      fontSize: '0.7rem',
      fontFamily: 'var(--font-body)',
      letterSpacing: '0.06em',
      fontWeight: 600,
      background: color,
      color: color === 'rgba(255,255,255,0.2)' ? 'var(--color-on-surface-variant)' : '#000',
    }}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ContactsPage
// ---------------------------------------------------------------------------
export function ContactsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<ContactListResponse | null>(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [area, setArea] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (s: string, t: string, a: string, archived: boolean, p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: p, limit: 50, archived: archived ? 1 : 0 };
      if (s) params['search'] = s;
      if (t) params['type'] = t;
      if (a) params['area'] = a;
      const result = await fetchContacts(params);
      setData(result);
    } catch (err) {
      console.error('Kontakte laden fehlgeschlagen', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initialer Load + bei Filter-/Page-Aenderung
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void load(search, type, area, showArchived, page);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, type, area, showArchived, page, load]);

  // Bei Filter-Aenderung: zurueck zu Seite 1
  useEffect(() => { setPage(1); }, [search, type, area, showArchived]);

  async function handleExportCsv() {
    setExporting(true);
    try {
      const params: Record<string, string> = { archived: showArchived ? '1' : '0' };
      if (search) params['search'] = search;
      if (type) params['type'] = type;
      if (area) params['area'] = area;
      const blob = await exportCsv(params);
      const date = new Date().toISOString().slice(0, 10);
      triggerDownload(blob, `kontakte-export-${date}.csv`);
    } catch (err) {
      console.error('CSV-Export fehlgeschlagen', err);
    } finally {
      setExporting(false);
    }
  }

  const totalPages = data ? Math.ceil(data.total / 50) : 1;

  // ---------------------------------------------------------------------------
  // Inline-Styles
  // ---------------------------------------------------------------------------
  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--color-outline-variant)',
    borderRadius: '0.5rem',
    color: 'var(--color-on-surface)',
    padding: '0.5rem 0.875rem',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  };

  const btnSecondary: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid var(--color-outline-variant)',
    borderRadius: '0.5rem',
    color: 'var(--color-on-surface)',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    whiteSpace: 'nowrap' as const,
  };

  const btnPrimary: React.CSSProperties = {
    background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#000',
    padding: '0.5rem 1.25rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    whiteSpace: 'nowrap' as const,
  };

  return (
    <PageWrapper>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>
          contacts
        </span>
        <h1 style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 800,
          fontSize: 'clamp(1.5rem, 3vw, 2rem)',
          letterSpacing: '-0.02em',
          color: 'var(--color-on-surface)',
        }}>
          Kontakte
        </h1>
        {data && (
          <span style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', marginLeft: '0.25rem' }}>
            {data.total} {data.total === 1 ? 'Kontakt' : 'Kontakte'}
          </span>
        )}
      </div>

      {/* Aktionsleiste */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        {/* Suche */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <span className="material-symbols-outlined" style={{
            position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)',
            fontSize: '1rem', color: 'var(--color-on-surface-variant)', pointerEvents: 'none',
          }}>search</span>
          <input
            type="text"
            placeholder="Kontakte durchsuchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
          />
        </div>

        {/* Typ-Filter */}
        <select value={type} onChange={e => setType(e.target.value)} style={selectStyle}>
          <option value="">Alle Typen</option>
          <option value="Kunde">Kunde</option>
          <option value="Lieferant">Lieferant</option>
          <option value="Partner">Partner</option>
          <option value="Interessent">Interessent</option>
          <option value="Sonstiges">Sonstiges</option>
        </select>

        {/* Bereich-Filter */}
        <select value={area} onChange={e => setArea(e.target.value)} style={selectStyle}>
          <option value="">Alle Bereiche</option>
          <option value="DJ">DJ</option>
          <option value="Amazon">Amazon</option>
          <option value="Cashback">Cashback</option>
          <option value="Finanzen">Finanzen</option>
          <option value="Privat">Privat</option>
          <option value="Sonstiges">Sonstiges</option>
        </select>

        {/* Archiv-Toggle */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={e => setShowArchived(e.target.checked)}
            style={{ accentColor: 'var(--color-primary)', width: '1rem', height: '1rem' }}
          />
          Archiviert
        </label>

        <div style={{ flex: 1 }} />

        {/* Buttons */}
        <button style={btnSecondary} onClick={() => navigate('/contacts/import')}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>upload_file</span>
          CSV-Import
        </button>
        <button style={btnSecondary} onClick={handleExportCsv} disabled={exporting}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>download</span>
          {exporting ? 'Exportiere...' : 'CSV-Export'}
        </button>
        <button style={btnPrimary} onClick={() => navigate('/contacts/new')}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
          Neuer Kontakt
        </button>
      </div>

      {/* Liste */}
      {loading && (
        <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', padding: '2rem 0', textAlign: 'center' }}>
          Lade...
        </div>
      )}

      {!loading && data?.data.length === 0 && (
        <div style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', padding: '3rem 0', textAlign: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.75rem', opacity: 0.4 }}>contacts</span>
          Keine Kontakte gefunden
        </div>
      )}

      {!loading && data && data.data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          {data.data.map(contact => (
            <ContactRow key={contact.id} contact={contact} onClick={() => navigate(`/contacts/${contact.id}`)} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > 50 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'center' }}>
          <button
            style={{ ...btnSecondary, opacity: page <= 1 ? 0.4 : 1 }}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>chevron_left</span>
            Zurück
          </button>
          <span style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
            Seite {page} von {totalPages}
          </span>
          <button
            style={{ ...btnSecondary, opacity: page >= totalPages ? 0.4 : 1 }}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Weiter
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>chevron_right</span>
          </button>
        </div>
      )}
    </PageWrapper>
  );
}

// ---------------------------------------------------------------------------
// Einzelne Kontaktzeile
// ---------------------------------------------------------------------------
function ContactRow({ contact, onClick }: { contact: Contact; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const isPerson = contact.contact_kind === 'person';
  const name = isPerson
    ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.organization_name || '—'
    : contact.organization_name || '—';

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.875rem',
        padding: '0.75rem 1rem',
        background: hovered ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '0.5rem',
        cursor: 'pointer',
        transition: 'background 120ms ease',
      }}
    >
      {/* Icon */}
      <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-primary)', flexShrink: 0 }}>
        {isPerson ? 'person' : 'apartment'}
      </span>

      {/* Kundennummer */}
      <span style={{
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        color: 'var(--color-on-surface-variant)',
        minWidth: '3.5rem',
        flexShrink: 0,
      }}>
        {contact.customer_number ?? '—'}
      </span>

      {/* Name + Position/Organisation */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 700,
          fontSize: '0.925rem',
          color: 'var(--color-on-surface)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {name}
        </div>
        {(contact.position || (isPerson && contact.organization_name)) && (
          <div style={{
            fontSize: '0.775rem',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {[contact.position, isPerson ? contact.organization_name : null].filter(Boolean).join(' · ')}
          </div>
        )}
        {/* Tags */}
        {contact.tags && (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
            {contact.tags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 3).map(tag => (
              <span key={tag} style={{
                padding: '0.1rem 0.4rem',
                borderRadius: '999px',
                fontSize: '0.65rem',
                background: 'rgba(255,255,255,0.08)',
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-body)',
              }}>{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Rechts: Badges + Ort */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {contact.primary_city && (
          <span style={{
            fontSize: '0.775rem',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }}>location_on</span>
            {contact.primary_city}
          </span>
        )}
        <Badge label={contact.type} color="rgba(255,255,255,0.12)" />
        <Badge label={contact.area} color={getAreaColor(contact.area)} />
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchDjCustomers, type DjCustomer } from '../../api/dj.api';

// ---------------------------------------------------------------------------
// KPI-Karte
// ---------------------------------------------------------------------------
function KpiCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={{
      background: 'var(--color-surface-container)',
      borderRadius: '0.75rem',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>{icon}</span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>{label}</span>
      </div>
      <span style={{ fontFamily: 'var(--font-headline)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DjCustomersPage
// ---------------------------------------------------------------------------
export function DjCustomersPage() {
  const navigate = useNavigate();

  // Hauptliste
  const [customers, setCustomers] = useState<DjCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Suche (clientseitig)
  const [search, setSearch] = useState('');


  // ---------------------------------------------------------------------------
  // Laden
  // ---------------------------------------------------------------------------
  async function loadCustomers() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDjCustomers();
      setCustomers(data);
    } catch {
      setError('Fehler beim Laden der Kunden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadCustomers(); }, []);

  // ---------------------------------------------------------------------------
  // Gefilterte Liste (clientseitig)
  // ---------------------------------------------------------------------------
  const filtered = customers.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = [c.first_name, c.last_name, c.organization_name].filter(Boolean).join(' ').toLowerCase();
    return (
      name.includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.city ?? '').toLowerCase().includes(q)
    );
  });

  // ---------------------------------------------------------------------------
  // KPI-Werte (clientseitig berechnet)
  // ---------------------------------------------------------------------------
  const kpiTotal = customers.length;
  const kpiWithEvents = customers.filter(c => (c.event_count ?? 0) > 0).length;
  const kpiWithoutEvents = customers.filter(c => (c.event_count ?? 0) === 0).length;

  // ---------------------------------------------------------------------------
  // Hilfsfunktion: Anzeigename
  // ---------------------------------------------------------------------------
  function displayName(c: DjCustomer): string {
    const personal = [c.first_name, c.last_name].filter(Boolean).join(' ');
    return personal || c.organization_name || '—';
  }

  // ---------------------------------------------------------------------------
  // Styles
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <PageWrapper>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>group</span>
        <h1 style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 800,
          fontSize: 'clamp(1.5rem, 3vw, 2rem)',
          letterSpacing: '-0.02em',
          color: 'var(--color-on-surface)',
        }}>
          Kunden
        </h1>
        <span style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', marginLeft: '0.25rem' }}>
          Kontakte mit Bereich „DJ"
        </span>
      </div>

      {/* KPI-Karten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        <KpiCard label="Gesamt-Kunden" value={kpiTotal} icon="group" />
        <KpiCard label="Mit Events" value={kpiWithEvents} icon="event" />
        <KpiCard label="Ohne Events" value={kpiWithoutEvents} icon="person_off" />
      </div>

      {/* Aktionsleiste */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem', alignItems: 'center' }}>
        {/* Suchfeld */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <span className="material-symbols-outlined" style={{
            position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)',
            fontSize: '1rem', color: 'var(--color-on-surface-variant)', pointerEvents: 'none',
          }}>search</span>
          <input
            type="text"
            placeholder="DJ-Kunden suchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...inputStyle, width: '100%', paddingLeft: '2rem', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ flex: 1 }} />

        {/* Neuer Kontakt */}
        <button type="button" style={btnPrimary} onClick={() => navigate('/contacts/new')}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
          Neuer Kontakt
        </button>
      </div>

      {/* Hauptinhalt */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
          Lade...
        </div>
      )}

      {!loading && error && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', overflow: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-on-surface-variant)', display: 'block', marginBottom: '1rem' }}>
                group_off
              </span>
              <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.9rem' }}>
                {search.trim() ? 'Keine DJ-Kunden für diesen Suchbegriff gefunden.' : 'Noch keine DJ-Kunden vorhanden.'}
              </p>
              {search.trim() && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{ ...btnSecondary, marginTop: '1rem' }}
                >
                  Filter zurücksetzen
                </button>
              )}
            </div>
          ) : (
            <div>
              {filtered.map((c, idx) => {
                const name = displayName(c);
                const isOrg = c.contact_kind === 'organization';
                const showOrg = !isOrg && c.organization_name;
                const eventCount = c.event_count ?? 0;

                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/contacts/${c.id}`)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(`/contacts/${c.id}`); }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      padding: '0.875rem 1.25rem',
                      cursor: 'pointer',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--color-outline-variant)',
                      transition: 'background 120ms',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    {/* Icon */}
                    <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-primary)', flexShrink: 0 }}>
                      {isOrg ? 'apartment' : 'person'}
                    </span>

                    {/* Name + Firma */}
                    <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {name}
                      </div>
                      {showOrg && (
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.775rem', color: 'var(--color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.organization_name}
                        </div>
                      )}
                    </div>

                    {/* Email */}
                    <div style={{ flex: '1 1 160px', minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      {c.email ? (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>mail</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.825rem', color: 'var(--color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.email}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', opacity: 0.4 }}>—</span>
                      )}
                    </div>

                    {/* Telefon */}
                    <div style={{ flex: '0 0 140px', minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      {c.phone ? (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>call</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.825rem', color: 'var(--color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.phone}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', opacity: 0.4 }}>—</span>
                      )}
                    </div>

                    {/* Ort */}
                    <div style={{ flex: '0 0 120px', minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      {c.city ? (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>location_on</span>
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.825rem', color: 'var(--color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.city}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8rem', fontFamily: 'var(--font-body)', opacity: 0.4 }}>—</span>
                      )}
                    </div>

                    {/* Event-Badge */}
                    <div style={{ flex: '0 0 90px', textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.625rem',
                        borderRadius: '999px',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: eventCount > 0 ? 'rgba(var(--color-primary-rgb, 204,151,255),0.18)' : 'rgba(255,255,255,0.06)',
                        color: eventCount > 0 ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                      }}>
                        {eventCount} {eventCount === 1 ? 'Event' : 'Events'}
                      </span>
                    </div>

                    {/* Chevron */}
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', flexShrink: 0, opacity: 0.5 }}>
                      chevron_right
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
}

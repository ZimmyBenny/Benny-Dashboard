import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  fetchDjEvent, fetchDjCustomers, createDjEvent, updateDjEvent,
  type DjCustomer, type StatusHistoryEntry,
} from '../../api/dj.api';
import { EVENT_TYPE_LABELS } from '../../components/dj/StatusBadge';
import { formatDate } from '../../lib/format';

// ---------------------------------------------------------------------------
// Status-Labels
// ---------------------------------------------------------------------------
const STATUS_LABELS: Record<string, string> = {
  anfrage: 'Anfrage',
  neu: 'Neu',
  vorgespraech_vereinbart: 'Vorgespräch vereinbart',
  angebot_gesendet: 'Angebot gesendet',
  bestaetigt: 'Bestätigt',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
};

// ---------------------------------------------------------------------------
// Hilfsfunktion Kundenname
// ---------------------------------------------------------------------------
function displayCustomerName(c: DjCustomer): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.organization_name || String(c.id);
}

// ---------------------------------------------------------------------------
// DjEventDetailPage
// ---------------------------------------------------------------------------
export function DjEventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id;

  // Formularfelder — customer_id aus URL-Param vorbelegen falls vorhanden
  const presetCustomerId = isNew ? Number(searchParams.get('customer_id')) || null : null;
  const [eventDate, setEventDate] = useState('');
  const [eventType, setEventType] = useState('hochzeit');
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState<number | null>(presetCustomerId);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [guests, setGuests] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('neu');
  const [venueName, setVenueName] = useState('');
  const [venueStreet, setVenueStreet] = useState('');
  const [venueZip, setVenueZip] = useState('');
  const [venueCity, setVenueCity] = useState('');

  // Hilfsdaten
  const [customers, setCustomers] = useState<DjCustomer[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);

  // UI-State
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kontakt-Picker
  const [customerSearch, setCustomerSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Laden
  // ---------------------------------------------------------------------------
  async function loadEvent() {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDjEvent(Number(id));
      setEventDate(data.event_date ?? '');
      setEventType(data.event_type ?? 'hochzeit');
      setTitle(data.title ?? '');
      setCustomerId(data.customer_id ?? null);
      setTimeStart(data.time_start ?? '');
      setTimeEnd(data.time_end ?? '');
      setGuests(data.guests != null ? String(data.guests) : '');
      setNotes(data.notes ?? '');
      setStatus(data.status ?? 'neu');
      setVenueName(data.venue_name ?? '');
      setVenueStreet(data.venue_street ?? '');
      setVenueZip(data.venue_zip ?? '');
      setVenueCity(data.venue_city ?? '');
      setStatusHistory(data.statusHistory ?? []);
    } catch {
      setError('Fehler beim Laden des Events');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchDjCustomers().then(setCustomers).catch(() => {});
    if (!isNew) void loadEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ---------------------------------------------------------------------------
  // Picker: Außerhalb-Klick + Escape
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!pickerOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [pickerOpen]);

  // ---------------------------------------------------------------------------
  // Picker: gefilterte Kunden
  // ---------------------------------------------------------------------------
  const filteredCustomers = customers.filter(c => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (
      (c.first_name ?? '').toLowerCase().includes(q) ||
      (c.last_name ?? '').toLowerCase().includes(q) ||
      (c.organization_name ?? '').toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const selectedCustomer = customerId != null ? customers.find(c => c.id === customerId) : null;

  // ---------------------------------------------------------------------------
  // Speichern
  // ---------------------------------------------------------------------------
  async function handleSave() {
    if (!eventDate || !eventType) {
      setError('Datum und Event-Typ sind Pflichtfelder.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        event_date: eventDate,
        event_type: eventType as import('../../api/dj.api').EventType,
        title: title.trim() || null,
        customer_id: customerId,
        time_start: timeStart || null,
        time_end: timeEnd || null,
        guests: guests ? Number(guests) : null,
        notes: notes.trim() || null,
        status: (isNew ? 'anfrage' : status) as import('../../api/dj.api').EventStatus,
        venue_name: venueName.trim() || null,
        venue_street: venueStreet.trim() || null,
        venue_zip: venueZip.trim() || null,
        venue_city: venueCity.trim() || null,
      };
      if (isNew) {
        await createDjEvent(payload);
      } else {
        await updateDjEvent(Number(id), payload);
      }
      navigate('/dj/events');
    } catch {
      setError('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(148,170,255,0.2)',
    borderRadius: '0.5rem',
    color: 'var(--color-on-surface)',
    padding: '0.5rem 0.875rem',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--color-on-surface-variant)',
    marginBottom: '0.375rem',
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };

  const btnPrimary: React.CSSProperties = {
    background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#060e20',
    padding: '0.5rem 1.25rem',
    cursor: saving ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    opacity: saving ? 0.6 : 1,
    boxShadow: '0 0 16px rgba(148,170,255,0.3)',
  };

  const btnSecondary: React.CSSProperties = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '0.5rem',
    color: 'var(--color-on-surface)',
    padding: '0.5rem 1rem',
    cursor: 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
  };

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '0.75rem',
    padding: '1.5rem',
  };

  // ---------------------------------------------------------------------------
  // Render: Ladevorgang
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <PageWrapper>
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
          Lade...
        </div>
      </PageWrapper>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <PageWrapper>
      {/* Ambient Glow */}
      <div style={{
        position: 'fixed', top: '80px', right: '5%',
        width: '400px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(148,170,255,0.06) 0%, transparent 70%)',
        pointerEvents: 'none', zIndex: 0,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '900px', margin: '0 auto', padding: '0 0 3rem' }}>

      {/* Zurück-Button */}
      <button
        type="button"
        onClick={() => navigate('/dj/events')}
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--color-on-surface-variant)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '0.25rem',
          marginBottom: '1.75rem', fontFamily: 'var(--font-body)', fontSize: '0.8125rem', padding: 0,
          opacity: 0.7,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
        Zurück zu Anfragen
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
<h1 style={{
            fontFamily: 'var(--font-headline)', fontWeight: 800,
            fontSize: 'clamp(1.5rem, 3vw, 2rem)', letterSpacing: '-0.02em',
            color: 'var(--color-on-surface)', margin: 0, lineHeight: 1,
          }}>
            {isNew ? 'Neue Anfrage' : (title || 'Event bearbeiten')}
          </h1>
        </div>
        <button type="button" style={btnPrimary} onClick={() => void handleSave()} disabled={saving}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>save</span>
          {saving ? 'Speichern…' : 'Speichern'}
        </button>
      </div>

      {/* Fehler-Meldung */}
      {error && (
        <div style={{
          background: 'rgba(255,110,132,0.15)',
          border: '1px solid rgba(255,110,132,0.4)',
          borderRadius: '0.5rem',
          padding: '0.625rem 1rem',
          marginBottom: '1.25rem',
          color: 'var(--color-error)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>error</span>
          {error}
        </div>
      )}

      {/* Formular-Karte */}
      <div style={cardStyle}>

        {/* Kontakt-Picker (volle Breite, über dem Grid) */}
        <div style={{ marginBottom: '1.25rem', position: 'relative' }} ref={pickerRef}>
          <label style={labelStyle}>Kunde (DJ-Kontakt)</label>
          <div
            role="button"
            tabIndex={0}
            onClick={() => { setPickerOpen(v => !v); setCustomerSearch(''); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { setPickerOpen(v => !v); setCustomerSearch(''); } }}
            style={{
              ...inputStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span style={{ color: selectedCustomer ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)' }}>
              {selectedCustomer ? displayCustomerName(selectedCustomer) : 'Kontakt wählen...'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); setCustomerId(null); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-on-surface-variant)',
                    display: 'flex',
                    padding: '0',
                    lineHeight: 1,
                  }}
                  title="Kontakt entfernen"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>close</span>
                </button>
              )}
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)' }}>
                {pickerOpen ? 'expand_less' : 'expand_more'}
              </span>
            </div>
          </div>

          {/* Picker-Dropdown */}
          {pickerOpen && (
            <div style={{
              position: 'absolute',
              zIndex: 100,
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '0.25rem',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(148,170,255,0.15)',
              borderRadius: '0.75rem',
              padding: '0.75rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
              <input
                type="text"
                autoFocus
                placeholder="Kontakt suchen..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                style={{ ...inputStyle, marginBottom: '0.5rem' }}
              />
              {filteredCustomers.length === 0 ? (
                <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem', margin: '0.25rem 0' }}>
                  Keine DJ-Kunden gefunden.
                </p>
              ) : (
                <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCustomerId(c.id); setPickerOpen(false); }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.625rem',
                        width: '100%',
                        background: c.id === customerId ? 'rgba(var(--color-primary-rgb, 204,151,255),0.1)' : 'none',
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.5rem 0.625rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        color: 'var(--color-on-surface)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.875rem',
                        transition: 'background 120ms',
                      }}
                      onMouseEnter={e => { if (c.id !== customerId) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                      onMouseLeave={e => { if (c.id !== customerId) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-primary)', flexShrink: 0 }}>
                        {c.contact_kind === 'organization' ? 'apartment' : 'person'}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayCustomerName(c)}
                      </span>
                      {c.id === customerId && (
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-primary)', marginLeft: 'auto' }}>check</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2-Spalten-Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem 1.5rem',
        }}>
          {/* Datum */}
          <div>
            <label style={labelStyle}>Eventdatum *</label>
            <input
              type="date"
              value={eventDate}
              onChange={e => setEventDate(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Event-Typ */}
          <div>
            <label style={labelStyle}>Event-Typ *</label>
            <select
              value={eventType}
              onChange={e => setEventType(e.target.value)}
              style={{ ...inputStyle, appearance: 'none' as const }}
            >
              {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {/* Titel */}
          <div>
            <label style={labelStyle}>Titel / Veranstaltungsname</label>
            <input
              type="text"
              placeholder="z.B. Hochzeit Müller & Schmidt"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Status (nur Edit) */}
          {!isNew && (
            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                style={{ ...inputStyle, appearance: 'none' as const }}
              >
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Veranstaltungslocation — Name (volle Breite) */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Veranstaltungslocation</label>
            <input
              type="text"
              placeholder="z.B. Alte Glasfabrik, Schloss Neuschwanstein…"
              value={venueName}
              onChange={e => setVenueName(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Straße + PLZ/Stadt */}
          <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Straße / Adresse</label>
              <input
                type="text"
                placeholder="Musterstraße 12"
                value={venueStreet}
                onChange={e => setVenueStreet(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>PLZ</label>
              <input
                type="text"
                placeholder="12345"
                value={venueZip}
                onChange={e => setVenueZip(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Stadt</label>
              <input
                type="text"
                placeholder="München"
                value={venueCity}
                onChange={e => setVenueCity(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Uhrzeit Start */}
          <div>
            <label style={labelStyle}>Beginn (Uhrzeit)</label>
            <input
              type="time"
              value={timeStart}
              onChange={e => setTimeStart(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Uhrzeit Ende */}
          <div>
            <label style={labelStyle}>Ende (Uhrzeit)</label>
            <input
              type="time"
              value={timeEnd}
              onChange={e => setTimeEnd(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Gäste */}
          <div>
            <label style={labelStyle}>Gästeanzahl</label>
            <input
              type="number"
              placeholder="z.B. 150"
              value={guests}
              onChange={e => setGuests(e.target.value)}
              min={0}
              style={inputStyle}
            />
          </div>

          {/* Leer (für Grid-Ausrichtung) */}
          <div />

          {/* Notizen (volle Breite) */}
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Notizen</label>
            <textarea
              placeholder="Interne Notizen, Besonderheiten, Kundenwünsche..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' as const }}
            />
          </div>
        </div>

        {/* Speichern-Button (unten, mobil) */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.75rem' }}>
          <button type="button" style={btnSecondary} onClick={() => navigate('/dj/events')}>
            Abbrechen
          </button>
          <button type="button" style={btnPrimary} onClick={() => void handleSave()} disabled={saving}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>save</span>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>

      {/* Status-Verlauf (nur bei Edit) */}
      {!isNew && (
        <div style={{ ...cardStyle, marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-primary)' }}>history</span>
            <h2 style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 700,
              fontSize: '1rem',
              color: 'var(--color-on-surface)',
              margin: 0,
            }}>
              Status-Verlauf
            </h2>
          </div>

          {statusHistory.length === 0 ? (
            <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
              Kein Status-Verlauf vorhanden.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '180px 1fr 1fr',
                gap: '1rem',
                padding: '0.5rem 0.75rem',
                borderBottom: '1px solid rgba(148,170,255,0.15)',
                marginBottom: '0.25rem',
              }}>
                {['Datum', 'Von', 'Nach'].map(col => (
                  <span key={col} style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--color-on-surface-variant)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}>
                    {col}
                  </span>
                ))}
              </div>

              {statusHistory.map((entry, idx) => {
                const dateObj = new Date(entry.created_at);
                const dateStr = formatDate(entry.created_at);
                const timeStr = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '180px 1fr 1fr',
                      gap: '1rem',
                      padding: '0.625rem 0.75rem',
                      borderTop: idx === 0 ? 'none' : '1px solid rgba(148,170,255,0.15)',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                      {dateStr}{timeStr ? ` ${timeStr}` : ''}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                      {entry.from_status ? (STATUS_LABELS[entry.from_status] ?? entry.from_status) : '—'}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)' }}>
                      {STATUS_LABELS[entry.to_status] ?? entry.to_status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      </div> {/* /position:relative wrapper */}
    </PageWrapper>
  );
}

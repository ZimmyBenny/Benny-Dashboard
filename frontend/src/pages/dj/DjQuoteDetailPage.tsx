import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  fetchDjQuote, fetchDjCustomers, fetchDjEvents, fetchDjServices,
  createDjQuote, updateDjQuote, finalizeDjQuote,
  type DjQuote, type DjCustomer, type DjEvent, type DjService,
} from '../../api/dj.api';
import { StatusBadge } from '../../components/dj/StatusBadge';
import { formatDate, formatCurrency } from '../../lib/format';

// ---------------------------------------------------------------------------
// Hilfsfunktion Kundenname
// ---------------------------------------------------------------------------
function displayCustomerName(c: DjCustomer): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.organization_name || String(c.id);
}

// ---------------------------------------------------------------------------
// ServiceSearchPicker — Suchfeld für Leistungen pro Position
// ---------------------------------------------------------------------------
function ServiceSearchPicker({
  services,
  selectedId,
  onSelect,
  disabled,
  inputStyle,
}: {
  services: DjService[];
  selectedId: number | null;
  onSelect: (svc: DjService | null) => void;
  disabled?: boolean;
  inputStyle: React.CSSProperties;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = selectedId ? services.find(s => s.id === selectedId) : null;

  const filtered = services
    .filter(s => s.active)
    .filter(s => !query || s.name.toLowerCase().includes(query.toLowerCase()) ||
      (s.description ?? '').toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  if (selected) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span style={{
          ...inputStyle,
          flex: 1,
          fontSize: '0.8rem',
          padding: '0.375rem 0.625rem',
          color: 'var(--color-primary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: disabled ? 0.7 : 1,
        }}>
          {selected.name}
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: '0.2rem', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            title="Auswahl aufheben (Freitext)"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>close</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <span className="material-symbols-outlined" style={{ position: 'absolute', left: '0.4rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', pointerEvents: 'none' }}>
          search
        </span>
        <input
          type="text"
          placeholder="Leistung suchen..."
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.375rem 0.625rem 0.375rem 1.75rem', width: '100%', boxSizing: 'border-box', opacity: disabled ? 0.7 : 1 }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '0.5rem',
          marginTop: '0.25rem',
          maxHeight: '200px',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {filtered.map(s => (
            <button
              key={s.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); onSelect(s); setQuery(''); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                padding: '0.5rem 0.75rem', textAlign: 'left',
                color: 'var(--color-on-surface)', fontFamily: 'var(--font-body)', fontSize: '0.825rem',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              <span style={{ fontWeight: 500 }}>{s.name}</span>
              <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.75rem', marginLeft: '0.5rem', flexShrink: 0 }}>
                {s.price_net.toFixed(2)} € / {s.unit}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && query.length > 0 && filtered.length === 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
          background: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '0.5rem', marginTop: '0.25rem',
          padding: '0.5rem 0.75rem',
          color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.8rem',
        }}>
          Keine Leistung gefunden — Freitext wird verwendet.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LocalItem — nur für lokalen State
// ---------------------------------------------------------------------------
interface LocalItem {
  _key: number;
  service_id: number | null;
  description: string;
  quantity: number;
  unit: string;
  price_net: number;
  tax_rate: number;
  discount_pct: number;
}

// ---------------------------------------------------------------------------
// DjQuoteDetailPage
// ---------------------------------------------------------------------------
export function DjQuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === 'new';

  // Formularfelder — customer_id aus URL-Param vorbelegen falls vorhanden
  const presetCustomerId = isNew ? Number(searchParams.get('customer_id')) || null : null;
  const [customerId, setCustomerId] = useState<number | null>(presetCustomerId);
  const [eventId, setEventId] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');

  // Positionen
  const [items, setItems] = useState<LocalItem[]>([]);

  // Hilfsdaten
  const [customers, setCustomers] = useState<DjCustomer[]>([]);
  const [events, setEvents] = useState<DjEvent[]>([]);
  const [services, setServices] = useState<DjService[]>([]);

  // Quote-Daten (für readonly-Modus)
  const [quote, setQuote] = useState<DjQuote | null>(null);
  const [finalized, setFinalized] = useState(false);

  // UI
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kontakt-Picker
  const [customerSearch, setCustomerSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Berechnungen (live)
  // ---------------------------------------------------------------------------
  const computedItems = items.map(item => {
    const total_net = item.quantity * item.price_net * (1 - item.discount_pct / 100);
    const tax = total_net * (item.tax_rate / 100);
    return { ...item, total_net, tax, total_gross: total_net + tax };
  });
  const subtotalNet = computedItems.reduce((s, i) => s + i.total_net, 0);
  const taxTotal = computedItems.reduce((s, i) => s + i.tax, 0);
  const totalGross = subtotalNet + taxTotal;

  // ---------------------------------------------------------------------------
  // Laden
  // ---------------------------------------------------------------------------
  useEffect(() => {
    void fetchDjCustomers().then(setCustomers).catch(() => {});
    void fetchDjEvents().then(setEvents).catch(() => {});
    void fetchDjServices().then(setServices).catch(() => {});

    if (!isNew && id) {
      setLoading(true);
      fetchDjQuote(Number(id))
        .then(data => {
          setQuote(data);
          setCustomerId(data.customer_id ?? null);
          setEventId(data.event_id ?? null);
          setSubject(data.subject ?? '');
          setValidUntil(data.valid_until ?? '');
          setFinalized(!!data.finalized_at);
          setItems(
            (data.items ?? []).map(i => ({
              _key: i.id ?? Date.now(),
              service_id: i.service_id,
              description: i.description,
              quantity: i.quantity,
              unit: i.unit,
              price_net: i.price_net,
              tax_rate: i.tax_rate,
              discount_pct: i.discount_pct,
            }))
          );
        })
        .catch(() => setError('Fehler beim Laden des Angebots'))
        .finally(() => setLoading(false));
    }
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
  // Positionen verwalten
  // ---------------------------------------------------------------------------
  function addItem() {
    setItems(prev => [
      ...prev,
      {
        _key: Date.now(),
        service_id: null,
        description: '',
        quantity: 1,
        unit: 'pauschal',
        price_net: 0,
        tax_rate: 19,
        discount_pct: 0,
      },
    ]);
  }

  function removeItem(key: number) {
    setItems(prev => prev.filter(i => i._key !== key));
  }

  function updateItem(key: number, patch: Partial<LocalItem>) {
    setItems(prev => prev.map(i => (i._key === key ? { ...i, ...patch } : i)));
  }

  // ---------------------------------------------------------------------------
  // Speichern
  // ---------------------------------------------------------------------------
  async function handleSave() {
    if (!customerId) {
      setError('Kunde ist Pflichtfeld.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        customer_id: customerId,
        event_id: eventId,
        subject: subject.trim() || null,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
        internal_notes: internalNotes.trim() || null,
        items: computedItems.map((item, idx) => ({
          position: idx + 1,
          service_id: item.service_id,
          package_id: null,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          price_net: item.price_net,
          tax_rate: item.tax_rate,
          discount_pct: item.discount_pct,
          total_net: item.total_net,
        })),
      };

      if (isNew) {
        const created = await createDjQuote(payload);
        navigate(`/dj/quotes/${created.id}`, { replace: true });
      } else {
        const updated = await updateDjQuote(Number(id), payload);
        setQuote(updated);
        setItems(
          (updated.items ?? []).map(i => ({
            _key: i.id ?? Date.now(),
            service_id: i.service_id,
            description: i.description,
            quantity: i.quantity,
            unit: i.unit,
            price_net: i.price_net,
            tax_rate: i.tax_rate,
            discount_pct: i.discount_pct,
          }))
        );
      }
    } catch {
      setError('Fehler beim Speichern. Bitte erneut versuchen.');
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Finalisieren
  // ---------------------------------------------------------------------------
  async function handleFinalize() {
    if (!window.confirm('Angebot finalisieren? Danach kann es nicht mehr bearbeitet werden.')) return;
    setFinalizing(true);
    setError(null);
    try {
      const data = await finalizeDjQuote(Number(id));
      setQuote(data);
      setFinalized(true);
    } catch {
      setError('Fehler beim Finalisieren. Bitte erneut versuchen.');
    } finally {
      setFinalizing(false);
    }
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
    width: '100%',
    boxSizing: 'border-box' as const,
  };

  const inputReadonlyStyle: React.CSSProperties = {
    ...inputStyle,
    opacity: 0.7,
  };

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: 'var(--color-on-surface-variant)',
    marginBottom: '0.375rem',
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };

  const btnPrimary: React.CSSProperties = {
    background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
    border: 'none',
    borderRadius: '0.5rem',
    color: '#000',
    padding: '0.5rem 1.25rem',
    cursor: saving ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    opacity: saving ? 0.6 : 1,
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
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-surface-container)',
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
      {/* Zurück-Button */}
      <button
        type="button"
        onClick={() => navigate('/dj/quotes')}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--color-on-surface-variant)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          marginBottom: '1.5rem',
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          padding: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>arrow_back</span>
        Zurück zu Angeboten
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h1 style={{
            fontFamily: 'var(--font-headline)',
            fontWeight: 800,
            fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
            letterSpacing: '-0.02em',
            color: 'var(--color-on-surface)',
            margin: 0,
          }}>
            {isNew
              ? 'Neues Angebot'
              : (quote?.number ? `Angebot ${quote.number}` : `Angebot #${id}`)}
          </h1>
          {!isNew && quote?.status && (
            <StatusBadge status={quote.status} />
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Finalisieren-Button: nur sichtbar wenn !isNew && !finalized && status=entwurf */}
          {!isNew && !finalized && quote?.status === 'entwurf' && (
            <button
              type="button"
              onClick={() => void handleFinalize()}
              disabled={finalizing}
              style={{
                background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                border: 'none',
                borderRadius: '0.5rem',
                color: '#000',
                padding: '0.5rem 1.25rem',
                cursor: finalizing ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                opacity: finalizing ? 0.6 : 1,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>check_circle</span>
              {finalizing ? 'Wird finalisiert...' : 'Finalisieren'}
            </button>
          )}
          <button
            type="button"
            style={btnPrimary}
            onClick={() => void handleSave()}
            disabled={finalized || saving}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>save</span>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
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

      {/* Info-Banner: Readonly */}
      {finalized && (
        <div style={{
          background: 'rgba(148,170,255,0.1)',
          border: '1px solid rgba(148,170,255,0.3)',
          borderRadius: '0.5rem',
          padding: '0.625rem 1rem',
          marginBottom: '1.25rem',
          color: 'var(--color-primary)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>lock</span>
          Dieses Angebot wurde finalisiert und ist schreibgeschützt.
        </div>
      )}

      {/* Formular-Karte */}
      <div style={cardStyle}>

        {/* Sektion 1 — Stammdaten */}
        {/* Kontakt-Picker (volle Breite) */}
        <div style={{ marginBottom: '1.25rem', position: 'relative' }} ref={pickerRef}>
          <label style={labelStyle}>Kunde *</label>
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              if (finalized) return;
              setPickerOpen(v => !v);
              setCustomerSearch('');
            }}
            onKeyDown={e => {
              if (finalized) return;
              if (e.key === 'Enter' || e.key === ' ') {
                setPickerOpen(v => !v);
                setCustomerSearch('');
              }
            }}
            style={{
              ...inputStyle,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: finalized ? 'default' : 'pointer',
              userSelect: 'none',
              opacity: finalized ? 0.7 : 1,
            }}
          >
            <span style={{ color: selectedCustomer ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)' }}>
              {selectedCustomer ? displayCustomerName(selectedCustomer) : 'Kontakt wählen...'}
            </span>
            {!finalized && (
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
            )}
          </div>

          {/* Picker-Dropdown */}
          {pickerOpen && !finalized && (
            <div style={{
              position: 'absolute',
              zIndex: 100,
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '0.25rem',
              background: 'var(--color-surface-container)',
              border: '1px solid var(--color-outline-variant)',
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
                        background: c.id === customerId ? 'rgba(148,170,255,0.1)' : 'none',
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
          marginBottom: '1.25rem',
        }}>
          {/* Event-Dropdown */}
          <div>
            <label style={labelStyle}>Event (optional)</label>
            <select
              value={eventId ?? ''}
              onChange={e => setEventId(e.target.value ? Number(e.target.value) : null)}
              disabled={finalized}
              style={{ ...inputStyle, appearance: 'none' as const, opacity: finalized ? 0.7 : 1 }}
            >
              <option value="">Kein Event</option>
              {events.map(e => (
                <option key={e.id} value={e.id}>
                  {formatDate(e.event_date)} — {e.title || 'Event'}
                </option>
              ))}
            </select>
          </div>

          {/* Betreff */}
          <div>
            <label style={labelStyle}>Betreff</label>
            <input
              type="text"
              placeholder="z.B. DJ-Auftritt Hochzeit"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              readOnly={finalized}
              style={finalized ? inputReadonlyStyle : inputStyle}
            />
          </div>

          {/* Gültig bis */}
          <div>
            <label style={labelStyle}>Gültig bis</label>
            <input
              type="date"
              value={validUntil}
              onChange={e => setValidUntil(e.target.value)}
              readOnly={finalized}
              style={finalized ? inputReadonlyStyle : inputStyle}
            />
          </div>
        </div>

        {/* Sektion 2 — Notizen */}
        <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={labelStyle}>Notizen (für Kunden sichtbar)</label>
            <textarea
              placeholder="Kundennotizen, Anmerkungen..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              readOnly={finalized}
              style={{ ...inputStyle, resize: 'vertical' as const, opacity: finalized ? 0.7 : 1 }}
            />
          </div>
          <div>
            <label style={labelStyle}>Interne Notizen</label>
            <textarea
              placeholder="Nur für dich sichtbar..."
              value={internalNotes}
              onChange={e => setInternalNotes(e.target.value)}
              rows={2}
              readOnly={finalized}
              style={{ ...inputStyle, resize: 'vertical' as const, opacity: finalized ? 0.7 : 1 }}
            />
          </div>
        </div>

        {/* Sektion 3 — Positionen */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1rem', color: 'var(--color-on-surface)', margin: 0 }}>
              Positionen
            </h2>
            <button
              type="button"
              onClick={addItem}
              disabled={finalized}
              style={{
                ...btnSecondary,
                opacity: finalized ? 0.5 : 1,
                cursor: finalized ? 'not-allowed' : 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
              Position hinzufügen
            </button>
          </div>

          {items.length > 0 && (
            <>
              {/* Tabellen-Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 80px 120px 100px 80px 120px 40px',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(255,255,255,0.03)',
                borderRadius: '0.375rem',
                marginBottom: '0.25rem',
              }}>
                {['Leistung', 'Menge', 'Einheit', 'Einzelpreis', 'MwSt', 'Netto', ''].map((col, i) => (
                  <span key={i} style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: 'var(--color-on-surface-variant)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    textAlign: col === 'Netto' ? 'right' : 'left',
                  }}>
                    {col}
                  </span>
                ))}
              </div>

              {/* Zeilen */}
              {computedItems.map((item) => (
                <div key={item._key} style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 80px 120px 100px 80px 120px 40px',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderTop: '1px solid var(--color-outline-variant)',
                  alignItems: 'center',
                }}>
                  {/* Leistung: Suchfeld + Beschreibungs-Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <ServiceSearchPicker
                      services={services}
                      selectedId={item.service_id}
                      disabled={finalized}
                      inputStyle={inputStyle}
                      onSelect={svc => {
                        if (!svc) {
                          updateItem(item._key, { service_id: null });
                        } else {
                          updateItem(item._key, {
                            service_id: svc.id,
                            description: svc.name,
                            unit: svc.unit,
                            price_net: svc.price_net,
                            tax_rate: svc.tax_rate,
                          });
                        }
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Beschreibung..."
                      value={item.description}
                      onChange={e => updateItem(item._key, { description: e.target.value })}
                      readOnly={finalized || !!item.service_id}
                      style={{
                        ...inputStyle,
                        fontSize: '0.8rem',
                        padding: '0.375rem 0.625rem',
                        opacity: (finalized || !!item.service_id) ? 0.7 : 1,
                      }}
                    />
                  </div>

                  {/* Menge */}
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={item.quantity}
                    onChange={e => updateItem(item._key, { quantity: Number(e.target.value) })}
                    readOnly={finalized}
                    style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.375rem 0.5rem', opacity: finalized ? 0.7 : 1 }}
                  />

                  {/* Einheit */}
                  <input
                    type="text"
                    value={item.unit}
                    onChange={e => updateItem(item._key, { unit: e.target.value })}
                    readOnly={finalized}
                    style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.375rem 0.5rem', opacity: finalized ? 0.7 : 1 }}
                  />

                  {/* Einzelpreis */}
                  <input
                    type="number"
                    step={0.01}
                    value={item.price_net}
                    onChange={e => updateItem(item._key, { price_net: Number(e.target.value) })}
                    readOnly={finalized}
                    style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.375rem 0.5rem', opacity: finalized ? 0.7 : 1 }}
                  />

                  {/* MwSt */}
                  <select
                    value={item.tax_rate}
                    onChange={e => updateItem(item._key, { tax_rate: Number(e.target.value) })}
                    disabled={finalized}
                    style={{ ...inputStyle, appearance: 'none' as const, fontSize: '0.8rem', padding: '0.375rem 0.5rem', opacity: finalized ? 0.7 : 1 }}
                  >
                    <option value={0}>0%</option>
                    <option value={7}>7%</option>
                    <option value={19}>19%</option>
                  </select>

                  {/* Netto (berechnet) */}
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.85rem',
                    color: 'var(--color-on-surface-variant)',
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatCurrency(item.total_net)}
                  </span>

                  {/* Löschen */}
                  <button
                    type="button"
                    onClick={() => removeItem(item._key)}
                    disabled={finalized}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: finalized ? 'not-allowed' : 'pointer',
                      color: 'var(--color-error)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.25rem',
                      borderRadius: '0.375rem',
                      opacity: finalized ? 0.4 : 1,
                    }}
                    title="Position entfernen"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
                  </button>
                </div>
              ))}
            </>
          )}

          {items.length === 0 && (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              border: '1px dashed var(--color-outline-variant)',
              borderRadius: '0.5rem',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
            }}>
              Noch keine Positionen. Klicke auf "Position hinzufügen".
            </div>
          )}

          {/* Summen-Block */}
          {items.length > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '0.375rem',
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--color-outline-variant)',
            }}>
              <div style={{ display: 'flex', gap: '2rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                <span>Netto:</span>
                <span style={{ minWidth: '100px', textAlign: 'right' }}>{formatCurrency(subtotalNet)}</span>
              </div>
              <div style={{ display: 'flex', gap: '2rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                <span>MwSt:</span>
                <span style={{ minWidth: '100px', textAlign: 'right' }}>{formatCurrency(taxTotal)}</span>
              </div>
              <div style={{
                display: 'flex',
                gap: '2rem',
                fontFamily: 'var(--font-headline)',
                fontSize: '1.125rem',
                fontWeight: 700,
                color: 'var(--color-primary)',
                marginTop: '0.25rem',
                paddingTop: '0.375rem',
                borderTop: '1px solid var(--color-outline-variant)',
              }}>
                <span>Gesamt:</span>
                <span style={{ minWidth: '100px', textAlign: 'right' }}>{formatCurrency(totalGross)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Aktions-Buttons unten */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.75rem' }}>
          <button type="button" style={btnSecondary} onClick={() => navigate('/dj/quotes')}>
            Abbrechen
          </button>
          <button
            type="button"
            style={{ ...btnPrimary, cursor: (finalized || saving) ? 'not-allowed' : 'pointer', opacity: (finalized || saving) ? 0.6 : 1 }}
            onClick={() => void handleSave()}
            disabled={finalized || saving}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>save</span>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}

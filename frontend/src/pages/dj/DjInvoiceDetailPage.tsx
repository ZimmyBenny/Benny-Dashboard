import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  fetchDjInvoice, fetchDjCustomers, fetchDjEvents, fetchDjServices,
  createDjInvoice, updateDjInvoice, finalizeDjInvoice, cancelDjInvoice, payDjInvoice,
  type DjInvoice, type DjCustomer, type DjEvent, type DjService,
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
// DjInvoiceDetailPage
// ---------------------------------------------------------------------------
export function DjInvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  // Formularfelder
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [eventId, setEventId] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  // Positionen
  const [items, setItems] = useState<LocalItem[]>([]);

  // Hilfsdaten
  const [customers, setCustomers] = useState<DjCustomer[]>([]);
  const [events, setEvents] = useState<DjEvent[]>([]);
  const [services, setServices] = useState<DjService[]>([]);

  // Rechnung (für readonly-Modus)
  const [invoice, setInvoice] = useState<DjInvoice | null>(null);
  const [finalized, setFinalized] = useState(false);

  // UI
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Zahlung-Modal
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState('');
  const [payMethodVal, setPayMethodVal] = useState('Überweisung');
  const [paying, setPaying] = useState(false);

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
      fetchDjInvoice(Number(id))
        .then(data => {
          setInvoice(data);
          setCustomerId(data.customer_id ?? null);
          setEventId(data.event_id ?? null);
          setSubject(data.subject ?? '');
          setDueDate(data.due_date ?? '');
          setPaymentMethod((data as DjInvoice & { payment_method?: string }).payment_method ?? '');
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
        .catch(() => setError('Fehler beim Laden der Rechnung'))
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

  function handleServiceSelect(key: number, serviceId: string) {
    if (!serviceId) {
      updateItem(key, { service_id: null });
      return;
    }
    const svc = services.find(s => s.id === Number(serviceId));
    if (svc) {
      updateItem(key, {
        service_id: svc.id,
        description: svc.name,
        unit: svc.unit,
        price_net: svc.price_net,
        tax_rate: svc.tax_rate,
      });
    }
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
        due_date: dueDate || null,
        payment_method: paymentMethod || null,
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
        const created = await createDjInvoice(payload);
        navigate(`/dj/invoices/${created.id}`, { replace: true });
      } else {
        const updated = await updateDjInvoice(Number(id), payload);
        setInvoice(updated);
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
    if (!window.confirm('Rechnung finalisieren? Danach kann sie nicht mehr bearbeitet werden.')) return;
    setFinalizing(true);
    setError(null);
    try {
      const data = await finalizeDjInvoice(Number(id));
      setInvoice(data);
      setFinalized(true);
    } catch {
      setError('Fehler beim Finalisieren. Bitte erneut versuchen.');
    } finally {
      setFinalizing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Stornieren
  // ---------------------------------------------------------------------------
  async function handleCancel() {
    if (!window.confirm('Rechnung stornieren? Es wird eine Stornorechnung erstellt.')) return;
    setCanceling(true);
    setError(null);
    try {
      await cancelDjInvoice(Number(id));
      navigate('/dj/invoices');
    } catch {
      setError('Fehler beim Stornieren. Bitte erneut versuchen.');
      setCanceling(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Zahlung-Modal öffnen
  // ---------------------------------------------------------------------------
  function openPayModal() {
    const openAmount = (invoice?.total_gross ?? 0) - (invoice?.paid_amount ?? 0);
    setPayAmount(Math.max(0, openAmount));
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayMethodVal('Überweisung');
    setPayModalOpen(true);
  }

  // ---------------------------------------------------------------------------
  // Zahlung buchen
  // ---------------------------------------------------------------------------
  async function handlePay() {
    setPaying(true);
    try {
      await payDjInvoice(Number(id), {
        payment_date: payDate,
        amount: payAmount,
        method: payMethodVal,
      });
      setPayModalOpen(false);
      // Rechnung neu laden
      const updated = await fetchDjInvoice(Number(id));
      setInvoice(updated);
    } catch {
      setError('Fehler beim Buchen der Zahlung.');
    } finally {
      setPaying(false);
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

  const btnDanger: React.CSSProperties = {
    background: 'rgba(255,110,132,0.15)',
    border: '1px solid rgba(255,110,132,0.4)',
    borderRadius: '0.5rem',
    color: 'var(--color-error)',
    padding: '0.5rem 1rem',
    cursor: canceling ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-body)',
    fontSize: '0.875rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375rem',
    opacity: canceling ? 0.6 : 1,
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--color-surface-container)',
    borderRadius: '0.75rem',
    padding: '1.5rem',
  };

  // Summen: bei finalized aus invoice lesen, sonst live
  const displaySubtotalNet = finalized && invoice
    ? (invoice as DjInvoice & { subtotal_net?: number }).subtotal_net ?? 0
    : subtotalNet;
  const displayTaxTotal = finalized && invoice
    ? (invoice as DjInvoice & { tax_total?: number }).tax_total ?? 0
    : taxTotal;
  const displayTotalGross = finalized && invoice ? invoice.total_gross : totalGross;

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
        onClick={() => navigate('/dj/invoices')}
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
        Zurück zu Rechnungen
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
              ? 'Neue Rechnung'
              : (invoice?.number ? `Rechnung ${invoice.number}` : `Rechnung #${id}`)}
          </h1>
          {!isNew && invoice?.status && (
            <StatusBadge status={invoice.status} />
          )}
        </div>

        {/* Header-Buttons (rechts nach links: Zahlung, Stornieren, Finalisieren, Speichern) */}
        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Zahlung verbuchen */}
          {!isNew && finalized && invoice?.status !== 'storniert' && invoice?.status !== 'bezahlt' && (
            <button
              type="button"
              style={btnSecondary}
              onClick={openPayModal}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>payments</span>
              Zahlung verbuchen
            </button>
          )}

          {/* Stornieren */}
          {!isNew && finalized && invoice?.status !== 'storniert' && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={canceling}
              style={btnDanger}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>cancel</span>
              {canceling ? 'Wird storniert...' : 'Stornieren'}
            </button>
          )}

          {/* Finalisieren */}
          {!isNew && !finalized && invoice?.status === 'entwurf' && (
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

          {/* Speichern */}
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

      {/* GoBD-readonly-Banner */}
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
          Diese Rechnung wurde finalisiert (GoBD-geschützt) und ist schreibgeschützt.
        </div>
      )}

      {/* Stornorechnung-Banner */}
      {invoice?.is_cancellation === 1 && (
        <div style={{
          background: 'rgba(255,200,0,0.1)',
          border: '1px solid rgba(255,200,0,0.3)',
          borderRadius: '0.5rem',
          padding: '0.625rem 1rem',
          marginBottom: '1.25rem',
          color: 'var(--color-on-surface)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'orange' }}>info</span>
          Dies ist eine Stornorechnung.
          {invoice.cancels_invoice_id && ` (storniert Rechnung #${invoice.cancels_invoice_id})`}
        </div>
      )}

      {/* Storniert-Banner */}
      {invoice?.cancelled_by_invoice_id && (
        <div style={{
          background: 'rgba(255,110,132,0.1)',
          border: '1px solid rgba(255,110,132,0.3)',
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
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>cancel</span>
          Diese Rechnung wurde storniert.
        </div>
      )}

      {/* Formular-Karte */}
      <div style={cardStyle}>

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

          {/* Fälligkeitsdatum */}
          <div>
            <label style={labelStyle}>Fälligkeitsdatum</label>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              readOnly={finalized}
              style={finalized ? inputReadonlyStyle : inputStyle}
            />
          </div>

          {/* Zahlungskonditionen */}
          <div>
            <label style={labelStyle}>Zahlungskonditionen</label>
            <input
              type="text"
              placeholder="z.B. Zahlbar innerhalb 14 Tage"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value)}
              readOnly={finalized}
              style={finalized ? inputReadonlyStyle : inputStyle}
            />
          </div>
        </div>

        {/* Sektion — Positionen */}
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
              {computedItems.map(item => (
                <div key={item._key} style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 80px 120px 100px 80px 120px 40px',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderTop: '1px solid var(--color-outline-variant)',
                  alignItems: 'center',
                }}>
                  {/* Leistung: Service-Dropdown + Beschreibungs-Input */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <select
                      value={item.service_id ?? ''}
                      onChange={e => handleServiceSelect(item._key, e.target.value)}
                      disabled={finalized}
                      style={{ ...inputStyle, appearance: 'none' as const, fontSize: '0.8rem', padding: '0.375rem 0.625rem', opacity: finalized ? 0.7 : 1 }}
                    >
                      <option value="">(Freitext)</option>
                      {services.filter(s => s.active).map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
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
          {(items.length > 0 || finalized) && (
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
                <span style={{ minWidth: '100px', textAlign: 'right' }}>{formatCurrency(displaySubtotalNet)}</span>
              </div>
              <div style={{ display: 'flex', gap: '2rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                <span>MwSt:</span>
                <span style={{ minWidth: '100px', textAlign: 'right' }}>{formatCurrency(displayTaxTotal)}</span>
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
                <span>Gesamt (brutto):</span>
                <span style={{ minWidth: '100px', textAlign: 'right' }}>{formatCurrency(displayTotalGross)}</span>
              </div>
              {finalized && invoice && invoice.paid_amount > 0 && (
                <div style={{ display: 'flex', gap: '2rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span>Bezahlt:</span>
                  <span style={{ minWidth: '100px', textAlign: 'right', color: 'var(--color-primary)' }}>{formatCurrency(invoice.paid_amount)}</span>
                </div>
              )}
              {finalized && invoice && invoice.paid_amount < invoice.total_gross && invoice.status !== 'storniert' && (
                <div style={{ display: 'flex', gap: '2rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600 }}>
                  <span style={{ color: 'var(--color-error)' }}>Offen:</span>
                  <span style={{ minWidth: '100px', textAlign: 'right', color: 'var(--color-error)' }}>{formatCurrency(invoice.total_gross - invoice.paid_amount)}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Aktions-Buttons unten */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.75rem' }}>
          <button type="button" style={btnSecondary} onClick={() => navigate('/dj/invoices')}>
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

      {/* Zahlung-Modal */}
      {payModalOpen && (
        <>
          {/* Overlay */}
          <div
            onClick={() => setPayModalOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              zIndex: 200,
            }}
          />
          {/* Dialog */}
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-surface-container)',
            borderRadius: '1rem',
            padding: '1.5rem',
            width: 'min(480px, 90vw)',
            zIndex: 201,
          }}>
            <h2 style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 700,
              fontSize: '1.125rem',
              color: 'var(--color-on-surface)',
              margin: '0 0 1.25rem',
            }}>
              Zahlung verbuchen
            </h2>

            {/* Betrag */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Betrag (€)</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={payAmount}
                onChange={e => setPayAmount(Number(e.target.value))}
                style={inputStyle}
              />
            </div>

            {/* Datum */}
            <div style={{ marginBottom: '1rem' }}>
              <label style={labelStyle}>Zahlungsdatum</label>
              <input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Methode */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={labelStyle}>Zahlungsmethode</label>
              <select
                value={payMethodVal}
                onChange={e => setPayMethodVal(e.target.value)}
                style={{ ...inputStyle, appearance: 'none' as const }}
              >
                <option value="Überweisung">Überweisung</option>
                <option value="Bar">Bar</option>
                <option value="PayPal">PayPal</option>
                <option value="Sonstige">Sonstige</option>
              </select>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.625rem' }}>
              <button
                type="button"
                style={btnSecondary}
                onClick={() => setPayModalOpen(false)}
                disabled={paying}
              >
                Abbrechen
              </button>
              <button
                type="button"
                style={{
                  ...btnPrimary,
                  cursor: paying ? 'not-allowed' : 'pointer',
                  opacity: paying ? 0.6 : 1,
                }}
                onClick={() => void handlePay()}
                disabled={paying}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>check</span>
                {paying ? 'Wird gebucht...' : 'Zahlung buchen'}
              </button>
            </div>
          </div>
        </>
      )}
    </PageWrapper>
  );
}

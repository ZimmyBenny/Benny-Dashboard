import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import { fetchDjTrips, createDjTrip, deleteDjExpense, DjTrip } from '../../api/dj.api';
import { formatCurrency, formatDate, formatKm } from '../../lib/format';

const DISCLAIMER =
  'Diese Auflistung dient ausschließlich als Orientierungshilfe für die eigene Buchhaltung und ersetzt keine Steuerberatung. Kilometerpauschale (0,30 €/km, Dienstreisen) und Verpflegungsmehraufwand sind keine Steuerberatung. Vor Einreichung beim Finanzamt bitte mit dem Steuerberater abstimmen.';

const YEARS = [2024, 2025, 2026];

interface TripForm {
  expense_date: string;
  start_location: string;
  end_location: string;
  distance_km: string;
  purpose: string;
  rate_per_km: string;
}

const EMPTY_FORM: TripForm = {
  expense_date: '',
  start_location: '',
  end_location: '',
  distance_km: '',
  purpose: '',
  rate_per_km: '0.30',
};

export function DjTripsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TripForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DjTrip | null>(null);

  const queryClient = useQueryClient();
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ['dj-trips', year],
    queryFn: () => fetchDjTrips(year),
  });

  const totalKm = trips.reduce((s, t) => s + (t.distance_km ?? 0), 0);
  const totalReimbursement = trips.reduce((s, t) => s + t.reimbursement_amount, 0);
  const totalMeal = trips.reduce((s, t) => s + t.meal_allowance, 0);

  const reimbursement =
    (parseFloat(form.distance_km) || 0) * (parseFloat(form.rate_per_km) || 0);

  const createMutation = useMutation({
    mutationFn: createDjTrip,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-trips'] });
      setOpen(false);
      setForm(EMPTY_FORM);
      setFormError('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteDjExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dj-trips'] });
      setDeleteTarget(null);
    },
  });

  // Escape-Key zum Schließen des Slide-Overs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setForm(EMPTY_FORM);
        setFormError('');
      }
    };
    if (open) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.expense_date ||
      !form.start_location ||
      !form.end_location ||
      !form.distance_km ||
      !form.purpose
    ) {
      setFormError('Bitte alle Felder ausfüllen.');
      return;
    }
    setFormError('');
    createMutation.mutate({
      expense_date: form.expense_date,
      start_location: form.start_location,
      end_location: form.end_location,
      distance_km: parseFloat(form.distance_km),
      purpose: form.purpose,
      rate_per_km: parseFloat(form.rate_per_km) || 0.30,
      reimbursement_amount: reimbursement,
    });
  }

  function field(key: keyof TripForm, value: string) {
    setForm(f => ({ ...f, [key]: value }));
  }

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* Disclaimer-Banner */}
        <div style={{
          background: 'rgba(148,170,255,0.08)',
          borderRadius: '0.75rem',
          padding: '0.875rem 1rem',
          marginBottom: '2rem',
          display: 'flex',
          gap: '0.625rem',
          alignItems: 'flex-start',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-primary)', flexShrink: 0, marginTop: '0.1rem' }}>info</span>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>{DISCLAIMER}</p>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.75rem', color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>Fahrten</h1>
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', margin: 0 }}>Kilometerpauschale und Verpflegungsmehraufwand</p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              style={{
                background: 'var(--color-surface-container)',
                color: 'var(--color-on-surface)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                fontFamily: 'var(--font-body)',
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              onClick={() => setOpen(true)}
              style={{
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.5rem 1rem',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
              Neue Fahrt
            </button>
          </div>
        </div>

        {/* KPI-Karten */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem' }}>Gesamt km</p>
            <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>{formatKm(totalKm)}</p>
          </div>
          <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem' }}>Fahrten</p>
            <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>{trips.length}</p>
          </div>
          <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem' }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem' }}>Erstattung km</p>
            <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>{formatCurrency(totalReimbursement)}</p>
          </div>
          {totalMeal > 0 && (
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem' }}>Verpflegung</p>
              <p style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>{formatCurrency(totalMeal)}</p>
            </div>
          )}
        </div>

        {/* Tabelle */}
        <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', overflow: 'hidden' }}>
          {isLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>hourglass_empty</span>
              Lade Fahrten…
            </div>
          ) : trips.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '3rem', color: 'var(--color-primary)', display: 'block', marginBottom: '1rem' }}>directions_car</span>
              <p style={{ color: 'var(--color-on-surface-variant)', margin: 0 }}>Keine Fahrten für {year} erfasst.</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-container-high)' }}>
                  {['Datum', 'Event', 'Von', 'Nach', 'km', 'Zweck', 'Erstattung', 'Aktionen'].map(h => (
                    <th key={h} style={{
                      padding: '0.75rem 1rem',
                      textAlign: 'left',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 600,
                      fontSize: '0.75rem',
                      color: 'var(--color-on-surface-variant)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trips.map((t, i) => (
                  <tr
                    key={t.source === 'event' ? `event-${t.event_id}` : `manual-${t.id}`}
                    style={{
                      borderTop: i > 0 ? '1px solid var(--color-outline-variant)' : 'none',
                      background: 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-variant)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>
                      {formatDate(t.date)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                      {t.event_name ?? '–'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                      {t.start_location ?? '–'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                      {t.end_location ?? '–'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', whiteSpace: 'nowrap' }}>
                      {formatKm(t.distance_km)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                      {t.purpose ?? t.event_name ?? '–'}
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {formatCurrency(t.reimbursement_amount)}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      {t.source === 'manual' && t.id !== null && (
                        <button
                          onClick={() => setDeleteTarget(t)}
                          title="Fahrt löschen"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-error)',
                            padding: '0.25rem',
                            borderRadius: '0.25rem',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Slide-Over Overlay */}
      {open && (
        <>
          <div
            onClick={() => { setOpen(false); setForm(EMPTY_FORM); setFormError(''); }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 40,
            }}
          />
          <div
            data-draggable-modal
            style={{
              position: 'fixed',
              top: 80,
              right: 32,
              width: '420px',
              background: 'var(--color-surface-container)',
              borderRadius: '0.75rem',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              zIndex: 50,
              ...modalStyle,
            }}
          >
            {/* Drag-Handle / Header */}
            <div
              onMouseDown={onMouseDown}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--color-outline-variant)',
                ...headerStyle,
              }}
            >
              <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)', margin: 0 }}>
                Neue Fahrt
              </h2>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => { setOpen(false); setForm(EMPTY_FORM); setFormError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', padding: '0.25rem' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
              </button>
            </div>

            {/* Formular */}
            <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Datum</span>
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={e => field('expense_date', e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Von</span>
                <input
                  type="text"
                  placeholder="z. B. Berlin Mitte"
                  value={form.start_location}
                  onChange={e => field('start_location', e.target.value)}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Nach</span>
                <input
                  type="text"
                  placeholder="z. B. Hamburg Altona"
                  value={form.end_location}
                  onChange={e => field('end_location', e.target.value)}
                  style={inputStyle}
                />
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Kilometer</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0.0"
                    value={form.distance_km}
                    onChange={e => field('distance_km', e.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>€/km</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.30"
                    value={form.rate_per_km}
                    onChange={e => field('rate_per_km', e.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>

              {/* Live-Erstattung */}
              <div style={{
                background: 'var(--color-surface-container-high)',
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>Erstattung</span>
                <span style={{ fontFamily: 'var(--font-headline)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                  {formatCurrency(reimbursement)}
                </span>
              </div>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontWeight: 500 }}>Zweck</span>
                <input
                  type="text"
                  placeholder="z. B. Fahrt zum DJ-Event"
                  value={form.purpose}
                  onChange={e => field('purpose', e.target.value)}
                  style={inputStyle}
                />
              </label>

              {formError && (
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--color-error)', margin: 0 }}>{formError}</p>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); setForm(EMPTY_FORM); setFormError(''); }}
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-outline-variant)',
                    borderRadius: '0.5rem',
                    padding: '0.5rem 1rem',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    color: 'var(--color-on-surface)',
                    cursor: 'pointer',
                  }}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  style={{
                    background: 'var(--color-primary)',
                    color: 'var(--color-on-primary)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.5rem 1rem',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
                    opacity: createMutation.isPending ? 0.7 : 1,
                  }}
                >
                  {createMutation.isPending ? 'Speichern…' : 'Speichern'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Confirm-Dialog Löschen */}
      {deleteTarget && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              zIndex: 60,
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-surface-container)',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            width: '360px',
            zIndex: 70,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <h3 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)', margin: '0 0 0.75rem' }}>
              Fahrt löschen?
            </h3>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.375rem' }}>
              {formatDate(deleteTarget.date)} — {formatKm(deleteTarget.distance_km ?? 0)}
            </p>
            {deleteTarget.purpose && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: '0 0 1.25rem' }}>
                {deleteTarget.purpose}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  background: 'none',
                  border: '1px solid var(--color-outline-variant)',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 1rem',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface)',
                  cursor: 'pointer',
                }}
              >
                Abbrechen
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id as number)}
                disabled={deleteMutation.isPending}
                style={{
                  background: 'var(--color-error)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 1rem',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
                  opacity: deleteMutation.isPending ? 0.7 : 1,
                }}
              >
                {deleteMutation.isPending ? 'Löschen…' : 'Löschen'}
              </button>
            </div>
          </div>
        </>
      )}
    </PageWrapper>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-surface-container-high)',
  border: '1px solid var(--color-outline-variant)',
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  color: 'var(--color-on-surface)',
  width: '100%',
  boxSizing: 'border-box',
};

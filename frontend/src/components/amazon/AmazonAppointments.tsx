import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getAmazonAppointments, type AmazonAppointment } from '../../api/amazon.api';
import { isoDateLocal } from '../../lib/dates';

/**
 * AmazonAppointments — anstehende Termine aus Amazon-Kalendern (z.B. "Amazon FBA"),
 * rein lesend aus den gespiegelten calendar_events (kein Apple-Sync).
 * Panel-Stil analog AmazonOpenTasks, damit sie als Paar nebeneinander passen.
 */
function fmtWhen(a: AmazonAppointment): string {
  const d = new Date(a.start_at);
  if (Number.isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  if (a.is_all_day) return datePart;
  const timePart = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

export function AmazonAppointments() {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['amazon', 'appointments'],
    queryFn: getAmazonAppointments,
    staleTime: 60_000,
  });
  const items = data ?? [];

  return (
    <div style={{
      border: '1px solid rgba(148,170,255,0.25)',
      borderRadius: '1rem',
      background: 'linear-gradient(135deg, rgba(148,170,255,0.06) 0%, var(--color-surface-container) 100%)',
      boxShadow: '0 0 40px rgba(148,170,255,0.12), inset 0 1px 0 rgba(255,255,255,0.04)',
      padding: '1.25rem 1.5rem',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          width: '32px', height: '32px', borderRadius: '0.5rem',
          background: 'rgba(148,170,255,0.12)', border: '1px solid rgba(148,170,255,0.25)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.05rem', color: 'var(--color-primary)' }}>event</span>
        </span>
        <span style={{
          fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1rem',
          background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>
          Termine
        </span>
        {items.length > 0 && (
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-primary)',
            padding: '0.1rem 0.5rem', borderRadius: '9999px',
            background: 'rgba(148,170,255,0.15)', border: '1px solid rgba(148,170,255,0.3)',
          }}>
            {items.length}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => navigate('/calendar')}
          style={{
            fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-on-surface-variant)',
            background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          → Kalender
        </button>
      </div>

      {/* Inhalt */}
      {isLoading ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-outline)' }}>Lade…</p>
      ) : isError ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-error)' }}>Termine konnten nicht geladen werden.</p>
      ) : items.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>
          Keine anstehenden Amazon-Termine
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map((a) => (
            <button
              key={a.id}
              onClick={() => navigate('/calendar?date=' + isoDateLocal(new Date(a.start_at)))}
              style={{
                textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.7rem 0.9rem', borderRadius: '0.65rem',
                background: 'var(--color-surface-container-high)',
                border: '1px solid var(--color-outline-variant)',
                borderLeft: '3px solid rgba(148,170,255,0.35)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.05rem', color: 'var(--color-primary)', flexShrink: 0 }}>event</span>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-on-surface)',
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {a.title}
              </span>
              <span style={{
                fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-on-surface-variant)',
                flexShrink: 0, fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtWhen(a)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

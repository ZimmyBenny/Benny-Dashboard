import { useEffect, useState, useCallback } from 'react';
import { fetchReminders, completeReminder, type AppleReminder } from '../../api/reminders.api';

function listColor(name: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsla(${hue}, 60%, 55%, 0.15)`,
    fg: `hsl(${hue}, 70%, 75%)`,
  };
}

function formatDueDate(isoDate: string): string {
  // Manuelles Splitten — kein toLocaleDateString um Browser-Locale-Differenzen zu vermeiden
  const d = new Date(isoDate);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export function RemindersColumn() {
  const [reminders, setReminders] = useState<AppleReminder[]>([]);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(() => {
    fetchReminders()
      .then(setReminders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, [load]);

  async function handleComplete(uid: string) {
    const prev = reminders;
    setReminders(prev.filter((r) => r.apple_uid !== uid)); // optimistisch
    try {
      await completeReminder(uid);
    } catch {
      setReminders(prev);
      window.alert('Erinnerung konnte nicht als erledigt markiert werden.');
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minWidth: '280px',
      flex: 1,
      background: 'rgba(25,37,64,0.4)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: '0.875rem',
      overflow: 'hidden',
    }}>
      {/* Spalten-Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.875rem 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '18px', color: 'var(--color-primary)', flexShrink: 0 }}
        >
          phone_iphone
        </span>
        <span style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 700,
          fontSize: '0.8rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-on-surface)',
          flex: 1,
        }}>
          Erinnerungen
        </span>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '20px',
          height: '20px',
          padding: '0 6px',
          borderRadius: '9999px',
          background: 'rgba(255,255,255,0.07)',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.7rem',
          fontWeight: 600,
        }}>
          {reminders.length}
        </span>
      </div>

      {/* Karten-Bereich */}
      <div style={{
        flex: 1,
        padding: '0.75rem',
        minHeight: '200px',
        overflowY: 'auto',
      }}>
        {loading && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '80px',
            color: 'var(--color-outline)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            fontStyle: 'italic',
          }}>
            Erinnerungen werden geladen…
          </div>
        )}

        {!loading && reminders.length === 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '80px',
            color: 'var(--color-outline)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            fontStyle: 'italic',
          }}>
            Keine Erinnerungen
          </div>
        )}

        {!loading && reminders.map((r) => {
          const badge = r.list_name ? listColor(r.list_name) : null;
          return (
            <div
              key={r.apple_uid}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '0.5rem',
                padding: '0.625rem 0.75rem',
                marginBottom: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.375rem',
              }}
            >
              {/* Erste Zeile: Titel + Erledigt-Button */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  color: 'var(--color-on-surface)',
                  flex: 1,
                  lineHeight: 1.35,
                }}>
                  {r.title}
                </span>
                <button
                  onClick={() => handleComplete(r.apple_uid)}
                  title="Als erledigt markieren"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    color: 'var(--color-outline)',
                    transition: 'color 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = '#4ade80';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-outline)';
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                    check_circle
                  </span>
                </button>
              </div>

              {/* Zweite Zeile: Listen-Badge + Fälligkeitsdatum */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {r.list_name && badge && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '1px 7px',
                    borderRadius: '9999px',
                    background: badge.bg,
                    color: badge.fg,
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}>
                    {r.list_name}
                  </span>
                )}
                {r.due_date && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.6875rem',
                    color: 'var(--color-on-surface-variant)',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                      calendar_today
                    </span>
                    {formatDueDate(r.due_date)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

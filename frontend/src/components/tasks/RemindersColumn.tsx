import { useEffect, useState, useCallback } from 'react';
import { fetchReminders, completeReminder, triggerRemindersSync, type AppleReminder } from '../../api/reminders.api';

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
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export function RemindersColumn() {
  const [reminders, setReminders] = useState<AppleReminder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [search, setSearch]       = useState('');
  const [syncError, setSyncError] = useState<string | null>(null);

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

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    try {
      await triggerRemindersSync();
      setLoading(true);
      await fetchReminders().then(setReminders);
    } catch {
      setSyncError('Sync fehlgeschlagen');
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }

  const filtered = search.trim()
    ? reminders.filter((r) => r.title.toLowerCase().includes(search.trim().toLowerCase()))
    : reminders;

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
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

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
          {filtered.length}
        </span>
        <button
          onClick={handleSync}
          disabled={syncing}
          title="Apple Reminders synchronisieren"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: syncing ? 'default' : 'pointer',
            padding: '0',
            display: 'flex',
            alignItems: 'center',
            color: syncing ? 'var(--color-primary)' : 'var(--color-outline)',
            transition: 'color 150ms ease',
            opacity: syncing ? 0.7 : 1,
          }}
          onMouseEnter={(e) => { if (!syncing) (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)'; }}
          onMouseLeave={(e) => { if (!syncing) (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-outline)'; }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', animation: syncing ? 'spin 1s linear infinite' : 'none' }}
          >
            sync
          </span>
        </button>
      </div>

      {/* Suchfeld */}
      <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '0.5rem',
          padding: '0.375rem 0.625rem',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--color-outline)', flexShrink: 0 }}>
            search
          </span>
          <input
            type="text"
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'var(--font-body)',
              fontSize: '0.8rem',
              color: 'var(--color-on-surface)',
              caretColor: 'var(--color-primary)',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center', color: 'var(--color-outline)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
            </button>
          )}
        </div>
        {syncError && (
          <p style={{ margin: '0.375rem 0 0', fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: '#f87171' }}>
            {syncError}
          </p>
        )}
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

        {!loading && filtered.length === 0 && search && (
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
            Keine Treffer für „{search}"
          </div>
        )}

        {!loading && filtered.length === 0 && !search && (
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

        {!loading && filtered.map((r) => {
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

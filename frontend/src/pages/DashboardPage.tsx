import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { useTimerStore } from '../store/timerStore';
import { fetchVisibleQuickLinks, type QuickLink } from '../api/quickLinks.api';
import { fetchTaskStats, createTask, type TaskStats, type Task } from '../api/tasks.api';
import { TaskSlideOver } from '../components/tasks/TaskSlideOver';

function getGreeting(): { time: string; name: string } {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { time: 'Guten Morgen,', name: 'Benny.' };
  if (hour >= 12 && hour < 18) return { time: 'Guten Nachmittag,', name: 'Benny.' };
  if (hour >= 18 && hour < 22) return { time: 'Guten Abend,', name: 'Benny.' };
  return { time: 'Gute Nacht,', name: 'Benny.' };
}


const modules = [
  { path: '/zeiterfassung', label: 'Zeiterfassung', icon: 'timer',                  description: 'Zeiten · Projekte · Export', isTimer: true as const },
  { path: '/tasks',         label: 'Aufgaben',       icon: 'task_alt',               description: 'Planen · Verfolgen · Erledigen', isTasks: true as const },
  { path: '/calendar',      label: 'Kalender',       icon: 'calendar_month',         description: 'Termine und Events im Überblick', isCalendar: true as const },
  { path: '/dj',            label: 'DJ',             icon: 'headphones',             description: 'Gigs · Bookings · Zahlungen' },
  { path: '/finances',      label: 'Finanzen',       icon: 'account_balance_wallet', description: 'Einnahmen · Ausgaben · Budgets' },
  { path: '/amazon',        label: 'Amazon',         icon: 'shopping_cart',          description: 'Bestellungen und Retouren' },
];

function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const greeting = getGreeting();
  const dateStr = new Date().toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Schnellzugriff aus API
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);

  useEffect(() => {
    fetchVisibleQuickLinks().then(setQuickLinks).catch(() => {});
  }, []);

  // Aufgaben-Statistiken
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);

  useEffect(() => {
    fetchTaskStats().then(setTaskStats).catch(() => {});
  }, []);

  // Neue Aufgabe SlideOver
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);

  async function handleCreateTask(data: Partial<Task> & { title: string }) {
    await createTask(data);
    fetchTaskStats().then(setTaskStats).catch(() => {});
    setIsNewTaskOpen(false);
  }

  // Aktiver Timer
  const { status: timerStatus, getElapsedMs, start: startTimer } = useTimerStore();
  const [timerDisplay, setTimerDisplay] = useState(() => getElapsedMs());
  const timerActive = timerStatus === 'running' || timerStatus === 'paused';

  useEffect(() => {
    if (timerStatus !== 'running') {
      setTimerDisplay(getElapsedMs());
      return;
    }
    const id = setInterval(() => setTimerDisplay(getElapsedMs()), 1000);
    return () => clearInterval(id);
  }, [timerStatus, getElapsedMs]);

  return (
    <PageWrapper>
      {/* ── Hero ─────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: '3rem', paddingTop: '0.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {/* Ambient glows */}
        <div aria-hidden style={{
          position: 'absolute', top: '-80px', right: '-100px',
          width: '420px', height: '420px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(204,151,255,0.09) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: '-40px', left: '25%',
          width: '300px', height: '300px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52,181,250,0.07) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        {/* Left: Greeting */}
        <div>
          <h1 className="display-text" style={{
            fontSize: 'clamp(2.6rem, 5.5vw, 5rem)',
            color: 'var(--color-on-surface)',
            marginBottom: '0.05em',
          }}>
            {greeting.time}
          </h1>
          <h1 className="display-text gradient-text" style={{
            fontSize: 'clamp(2.6rem, 5.5vw, 5rem)',
          }}>
            {greeting.name}
          </h1>
        </div>

        {/* Right: Clock + Date */}
        <div style={{ textAlign: 'right', flexShrink: 0, paddingTop: '0.25rem' }}>
          <p style={{
            fontFamily: 'var(--font-headline)',
            fontWeight: 800,
            fontSize: 'clamp(2rem, 3.5vw, 3.5rem)',
            letterSpacing: '-0.03em',
            color: 'var(--color-on-surface)',
            lineHeight: 1,
            marginBottom: '0.4rem',
          }}>
            {time}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(0.8rem, 1.2vw, 1rem)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-outline)',
          }}>
            {dateStr}
          </p>
        </div>
      </div>

      {/* ── Aktiver Timer Widget ─────────────────────────── */}
      {timerActive && (
        <div
          onClick={() => navigate('/zeiterfassung')}
          style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '0.875rem 1.25rem',
            marginBottom: '1.75rem',
            background: timerStatus === 'running'
              ? 'rgba(52,181,250,0.07)'
              : 'rgba(204,151,255,0.07)',
            border: `1px solid ${timerStatus === 'running' ? 'rgba(52,181,250,0.2)' : 'rgba(204,151,255,0.2)'}`,
            borderRadius: '0.875rem',
            cursor: 'pointer',
            transition: 'border-color 200ms ease',
          }}
        >
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{
              fontSize: '20px',
              color: timerStatus === 'running' ? 'var(--color-secondary)' : 'var(--color-primary)',
            }}>timer</span>
            {timerStatus === 'running' && (
              <span style={{
                position: 'absolute', top: '-2px', right: '-2px',
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--color-secondary)',
                boxShadow: '0 0 6px rgba(52,181,250,0.8)',
              }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '0.7rem',
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: timerStatus === 'running' ? 'var(--color-secondary)' : 'var(--color-primary)',
              marginBottom: '0.1rem',
            }}>
              {timerStatus === 'running' ? 'Zeiterfassung läuft' : 'Zeiterfassung pausiert'}
            </p>
          </div>
          <div style={{
            fontFamily: 'var(--font-headline)', fontWeight: 800,
            fontSize: '1.25rem', letterSpacing: '-0.02em',
            color: timerStatus === 'running' ? 'var(--color-secondary)' : 'var(--color-primary)',
          }}>
            {formatMs(timerDisplay)}
          </div>
          <span className="material-symbols-outlined" style={{
            fontSize: '18px', color: 'var(--color-outline)', flexShrink: 0,
          }}>chevron_right</span>
        </div>
      )}

      {/* ── Section divider ──────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.65rem',
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--color-outline)',
          whiteSpace: 'nowrap',
        }}>
          Module
        </p>
        <div style={{
          flex: 1, height: '1px',
          background: 'linear-gradient(90deg, var(--color-outline-variant) 0%, transparent 100%)',
        }} />
      </div>

      {/* ── Module grid ──────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '0.875rem',
      }}>
        {modules.map((mod) => (
          <button
            key={mod.path}
            className="module-card"
            onClick={() => navigate(mod.path)}
            style={{ textAlign: 'left', padding: '1.5rem 1.5rem 1.25rem', cursor: 'pointer' }}
          >
            {/* Ghost icon backdrop */}
            <span className="material-symbols-outlined" aria-hidden style={{
              position: 'absolute', bottom: '0.5rem', right: '0.75rem',
              fontSize: '4.5rem', lineHeight: 1,
              color: 'var(--color-primary)', opacity: 0.06,
              pointerEvents: 'none',
            }}>
              {mod.icon}
            </span>

            {/* Content */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <span className="material-symbols-outlined" style={{
                fontSize: '1.375rem',
                color: 'var(--color-primary)',
                display: 'block',
                marginBottom: '0.875rem',
              }}>
                {mod.icon}
              </span>
              <p style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 700,
                fontSize: '0.875rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-on-surface)',
                marginBottom: '0.375rem',
              }}>
                {mod.label}
              </p>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.75rem',
                color: 'var(--color-on-surface-variant)',
                lineHeight: 1.5,
              }}>
                {mod.description}
              </p>

{'isTasks' in mod && (
                <div style={{ marginTop: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.625rem', justifyContent: 'space-between' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); setIsNewTaskOpen(true); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.35rem 0.8rem',
                      borderRadius: '9999px',
                      background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                      color: '#000', border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.7rem',
                      letterSpacing: '0.03em',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>add</span>
                    Neue Aufgabe
                  </button>
                  {taskStats !== null && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                      <span style={{
                        fontFamily: 'var(--font-headline)', fontWeight: 800,
                        fontSize: '1.25rem', letterSpacing: '-0.02em',
                        color: 'var(--color-on-surface)',
                        lineHeight: 1,
                      }}>
                        {taskStats.open_count ?? 0}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.7rem',
                        color: 'var(--color-on-surface-variant)',
                        letterSpacing: '0.04em', textTransform: 'uppercase',
                      }}>
                        offen
                      </span>
                    </div>
                  )}
                </div>
              )}

              {'isCalendar' in mod && (
                <div style={{ marginTop: '0.875rem' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate('/calendar', { state: { openNewEvent: true } }); }}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.35rem 0.8rem',
                      borderRadius: '9999px',
                      background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                      color: '#000', border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.7rem',
                      letterSpacing: '0.03em',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>add</span>
                    Neuer Termin
                  </button>
                </div>
              )}

              {'isTimer' in mod && (
                <div style={{ marginTop: '0.875rem' }}>
                  {timerActive ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {timerStatus === 'running' && (
                        <span style={{
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: 'var(--color-secondary)',
                          boxShadow: '0 0 6px rgba(52,181,250,0.7)',
                          flexShrink: 0,
                        }} />
                      )}
                      <span style={{
                        fontFamily: 'var(--font-headline)', fontWeight: 800,
                        fontSize: '1.1rem', letterSpacing: '-0.02em',
                        color: timerStatus === 'running' ? 'var(--color-secondary)' : 'var(--color-primary)',
                      }}>
                        {formatMs(timerDisplay)}
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); startTimer(); navigate('/zeiterfassung'); }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.35rem 0.8rem',
                        borderRadius: '9999px',
                        background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                        color: '#000', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.7rem',
                        letterSpacing: '0.03em',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>play_arrow</span>
                      Starten
                    </button>
                  )}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      {/* ── Aufgaben-Übersicht ──────────────────────────── */}
      {taskStats !== null && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2.5rem', marginBottom: '1.25rem' }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: 'var(--color-outline)',
              whiteSpace: 'nowrap',
            }}>
              Aufgaben-Übersicht
            </p>
            <div style={{
              flex: 1, height: '1px',
              background: 'linear-gradient(90deg, var(--color-outline-variant) 0%, transparent 100%)',
            }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.875rem' }}>
            {/* Offen */}
            <button className="module-card" onClick={() => navigate('/tasks')} style={{ textAlign: 'left', padding: '1.25rem' }}>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.03em', color: 'var(--color-on-surface)', lineHeight: 1, marginBottom: '0.375rem' }}>
                  {taskStats.open_count ?? 0}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                  Offene Aufgaben
                </p>
              </div>
            </button>

            {/* In Arbeit */}
            <button className="module-card" onClick={() => navigate('/tasks')} style={{ textAlign: 'left', padding: '1.25rem' }}>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.03em', color: 'var(--color-secondary)', lineHeight: 1, marginBottom: '0.375rem' }}>
                  {taskStats.in_progress_count ?? 0}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                  In Arbeit
                </p>
              </div>
            </button>

            {/* Diese Woche fällig */}
            <button className="module-card" onClick={() => navigate('/tasks')} style={{ textAlign: 'left', padding: '1.25rem' }}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.03em', color: 'var(--color-primary)', lineHeight: 1, marginBottom: '0.375rem' }}>
                    {taskStats.due_this_week ?? 0}
                  </p>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                    Diese Woche fällig
                  </p>
                </div>
            </button>

            {/* Erledigt diese Woche */}
            <button className="module-card" onClick={() => navigate('/tasks')} style={{ textAlign: 'left', padding: '1.25rem' }}>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.03em', color: '#4ade80', lineHeight: 1, marginBottom: '0.375rem' }}>
                  {taskStats.done_this_week ?? 0}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                  Erledigt diese Woche
                </p>
              </div>
            </button>

            {/* Überfällig */}
            <button className="module-card" onClick={() => navigate('/tasks')} style={{ textAlign: 'left', padding: '1.25rem' }}>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.03em', color: 'var(--color-error)', lineHeight: 1, marginBottom: '0.375rem' }}>
                  {taskStats.overdue_count ?? 0}
                </p>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>
                  Überfällig
                </p>
              </div>
            </button>
          </div>
        </>
      )}

      {/* ── Schnellzugriff ───────────────────────────────── */}
      <div style={{ marginTop: '2.5rem' }}>
        {/* Full-width card inkl. Titel */}
        <div style={{
          width: '100%',
          padding: '1.25rem 1.5rem',
          background: 'var(--color-surface-container)',
          border: '1px solid var(--color-surface-container-high)',
          borderRadius: '1rem',
        }}>
          {/* Titel */}
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <span className="material-symbols-outlined" style={{
              fontSize: '1.375rem',
              color: 'var(--color-primary)',
              display: 'block',
              marginBottom: '0.5rem',
            }}>bolt</span>
            <p style={{
              fontFamily: 'var(--font-headline)',
              fontWeight: 700,
              fontSize: '0.875rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-on-surface)',
            }}>
              Schnellzugriff
            </p>
          </div>

          {/* Links */}
          {quickLinks.length === 0 ? (
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.8125rem',
              color: 'var(--color-on-surface-variant)',
              textAlign: 'center',
            }}>
              Keine Schnellzugriffe konfiguriert
            </p>
          ) : (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0.75rem',
            }}>
              {quickLinks.map((link) => (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '9999px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    color: 'var(--color-on-surface-variant)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    letterSpacing: '0.01em',
                    textDecoration: 'none',
                    transition: 'border-color 150ms ease, color 150ms ease, background 150ms ease',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(204,151,255,0.35)';
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-primary)';
                    (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(204,151,255,0.06)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLAnchorElement).style.borderColor = 'rgba(255,255,255,0.09)';
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--color-on-surface-variant)';
                    (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)';
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>language</span>
                  {link.label}
                  <span className="material-symbols-outlined" style={{ fontSize: '13px', opacity: 0.5 }}>open_in_new</span>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
      <TaskSlideOver
        isOpen={isNewTaskOpen}
        onClose={() => setIsNewTaskOpen(false)}
        task={null}
        onSave={handleCreateTask}
        onDelete={async () => {}}
      />
    </PageWrapper>
  );
}

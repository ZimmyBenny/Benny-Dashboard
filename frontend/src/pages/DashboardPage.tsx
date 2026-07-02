import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import { useTimerStore } from '../store/timerStore';
import { fetchVisibleQuickLinks, type QuickLink } from '../api/quickLinks.api';
import { fetchTaskStats, createTask, type TaskStats, type Task } from '../api/tasks.api';
import { TaskSlideOver } from '../components/tasks/TaskSlideOver';
import { fetchContracts, type Contract } from '../api/contracts.api';
import { fetchSaldo, type HaushaltSaldo } from '../api/haushalt.api';
import { NeueAnfrageModal } from '../components/dj/NeueAnfrageModal';
import { fetchDjOverview, type DjOverview } from '../api/dj.api';
import { fetchEvents, type CalendarEvent } from '../api/calendar.api';
import { isoDateLocal, todayLocal, addDaysLocal } from '../lib/dates';

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
  { path: '/contacts',      label: 'Kontakte',       icon: 'contacts',               description: 'Kunden · Partner · Lieferanten', isContacts: true as const },
  { path: '/contracts',     label: 'Verträge & Fristen', icon: 'description',         description: 'Verträge · Fristen · Dokumente', isContracts: true as const },

  { path: '/finances',      label: 'Finanzen',       icon: 'account_balance_wallet', description: 'Einnahmen · Ausgaben · Budgets' },
  { path: '/haushalt', label: 'Haushalt',   icon: 'family_restroom',        description: 'Ausgaben · Geldübergaben · Abrechnungen', isHaushalt: true as const },
  { path: '/dj',       label: 'DJ',         icon: 'queue_music',            description: 'Events · Anfragen · Buchungen', isDj: true as const },
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

  // Bald fällige Verträge
  const [upcomingContracts, setUpcomingContracts] = useState<Contract[]>([]);

  useEffect(() => {
    fetchContracts({ segment: 'soon', limit: 5 }).then(r => setUpcomingContracts(r.data)).catch(() => {});
  }, []);

  // Verträge im Kündigungsfenster
  const [cancellableContracts, setCancellableContracts] = useState<Contract[]>([]);

  useEffect(() => {
    fetchContracts({ segment: 'cancellable', limit: 5 }).then(r => setCancellableContracts(r.data)).catch(() => {});
  }, []);

  // Haushalt-Saldo
  const [haushaltSaldo, setHaushaltSaldo] = useState<HaushaltSaldo | null>(null);
  useEffect(() => {
    fetchSaldo().then(setHaushaltSaldo).catch(() => {});
  }, []);

  // Neue Aufgabe SlideOver
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);

  // DJ Neue Anfrage Modal
  const [isDjAnfrageOpen, setIsDjAnfrageOpen] = useState(false);

  // DJ Offene Anfragen
  const [djOverview, setDjOverview] = useState<DjOverview | null>(null);
  useEffect(() => {
    fetchDjOverview(new Date().getFullYear()).then(setDjOverview).catch(() => {});
  }, []);

  // Kalender-Agenda: Heute bis in 7 Tagen
  const [agendaEvents, setAgendaEvents] = useState<CalendarEvent[] | null>(null);
  useEffect(() => {
    const from = todayLocal();
    const to = addDaysLocal(from, 7);
    fetchEvents(from, to).then(evs => {
      const sorted = [...evs].sort((a, b) => a.start_at.localeCompare(b.start_at));
      setAgendaEvents(sorted);
    }).catch(() => setAgendaEvents([]));
  }, []);

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

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
    padding: '0.3rem 0.65rem',
    borderRadius: '9999px',
    background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
    color: '#000', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.65rem',
    letterSpacing: '0.03em',
  };

  return (
    <PageWrapper>
      {/* ── Hero ─────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: '2rem', paddingTop: '0.25rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {/* Ambient glows */}
        <div aria-hidden style={{
          position: 'absolute', top: '-60px', right: '-80px',
          width: '280px', height: '280px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(204,151,255,0.09) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div aria-hidden style={{
          position: 'absolute', bottom: '-20px', left: '25%',
          width: '180px', height: '180px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(52,181,250,0.07) 0%, transparent 65%)',
          pointerEvents: 'none',
        }} />

        {/* Left: Greeting */}
        <div>
          <h1 className="display-text" style={{
            fontSize: 'clamp(1.6rem, 3vw, 2.75rem)',
            color: 'var(--color-on-surface)',
            marginBottom: '0.05em',
          }}>
            {greeting.time}
          </h1>
          <h1 className="display-text gradient-text" style={{
            fontSize: 'clamp(1.6rem, 3vw, 2.75rem)',
          }}>
            {greeting.name}
          </h1>
        </div>

        {/* Right: Clock + Date */}
        <div style={{ textAlign: 'right', flexShrink: 0, paddingTop: '0.25rem' }}>
          <p style={{
            fontFamily: 'var(--font-headline)',
            fontWeight: 800,
            fontSize: 'clamp(1.5rem, 2.5vw, 2.5rem)',
            letterSpacing: '-0.03em',
            color: 'var(--color-on-surface)',
            lineHeight: 1,
            marginBottom: '0.3rem',
          }}>
            {time}
          </p>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(0.7rem, 1vw, 0.85rem)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-outline)',
          }}>
            {dateStr}
          </p>
        </div>
      </div>

      {/* ── KPI-Streifen (Option C) ──────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem', marginBottom: '1.5rem' }}>

        {/* Offene Aufgaben */}
        <button onClick={() => navigate('/tasks')} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.75rem', padding: '0.875rem 1rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-primary)', flexShrink: 0 }}>task_alt</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1 }}>{taskStats?.open_count ?? '–'}</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: 0, marginTop: '0.15rem' }}>Aufgaben offen</p>
          </div>
        </button>

        {/* DJ-Anfragen */}
        <button onClick={() => navigate('/dj/events')} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.75rem', padding: '0.875rem 1rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-tertiary)', flexShrink: 0 }}>queue_music</span>
          <div>
            <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1 }}>{djOverview?.open_requests ?? '–'}</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: 0, marginTop: '0.15rem' }}>DJ-Anfragen</p>
          </div>
        </button>

        {/* In Arbeit */}
        <button onClick={() => navigate('/tasks')} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '0.75rem', padding: '0.875rem 1rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-secondary)', flexShrink: 0 }}>pending</span>
          <div>
            <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.5rem', color: 'var(--color-secondary)', margin: 0, lineHeight: 1 }}>{taskStats?.in_progress_count ?? '–'}</p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: 0, marginTop: '0.15rem' }}>In Arbeit</p>
          </div>
        </button>

        {/* Heute-Termine */}
        <div style={{ background: 'rgba(148,170,255,0.05)', border: '1px solid rgba(148,170,255,0.15)', borderRadius: '0.75rem', padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', overflow: 'hidden' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-primary)', margin: 0 }}>Heute</p>
          {(() => {
            const todayStr = todayLocal();
            const todayEvs = (agendaEvents ?? []).filter(ev => isoDateLocal(new Date(ev.start_at)) === todayStr);
            if (!agendaEvents) return <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-outline)' }}>Lade…</p>;
            if (todayEvs.length === 0) return <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-outline)', fontStyle: 'italic' }}>Keine Termine</p>;
            return todayEvs.slice(0, 2).map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-primary)', whiteSpace: 'nowrap' }}>
                  {ev.is_all_day ? '–' : new Date(ev.start_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ev.title}
                </span>
              </div>
            ));
          })()}
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
        gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))',
        gap: '0.625rem',
      }}>
        {modules.map((mod) => (
          <button
            key={mod.path}
            className="module-card"
            onClick={() => navigate(mod.path)}
            style={{ textAlign: 'left', padding: '0.875rem 1rem', cursor: 'pointer' }}
          >
            {/* Ghost icon backdrop */}
            <span className="material-symbols-outlined" aria-hidden style={{
              position: 'absolute', bottom: '0.25rem', right: '0.5rem',
              fontSize: '3rem', lineHeight: 1,
              color: 'var(--color-primary)', opacity: 0.06,
              pointerEvents: 'none',
            }}>
              {mod.icon}
            </span>

            {/* Content */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <span className="material-symbols-outlined" style={{
                fontSize: '1.1rem',
                color: 'var(--color-primary)',
                display: 'block',
                marginBottom: '0.5rem',
              }}>
                {mod.icon}
              </span>
              <p style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 700,
                fontSize: '0.75rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-on-surface)',
                marginBottom: '0.2rem',
              }}>
                {mod.label}
              </p>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.65rem',
                color: 'var(--color-on-surface-variant)',
                lineHeight: 1.4,
              }}>
                {mod.description}
              </p>

{'isTasks' in mod && (
                <div style={{ marginTop: '0.625rem' }}>
                  {taskStats !== null && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '0.4rem' }}>
                      <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-on-surface)', lineHeight: 1 }}>{taskStats.open_count ?? 0}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>offen</span>
                    </div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setIsNewTaskOpen(true); }} style={btnStyle}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                    Neue Aufgabe
                  </button>
                </div>
              )}

              {'isCalendar' in mod && (
                <div style={{ marginTop: '0.625rem' }}>
                  {agendaEvents !== null && (() => {
                    const todayStr = todayLocal();
                    const count = agendaEvents.filter(ev => isoDateLocal(new Date(ev.start_at)) === todayStr).length;
                    return (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '0.4rem' }}>
                        <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-on-surface)', lineHeight: 1 }}>{count}</span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>heute</span>
                      </div>
                    );
                  })()}
                  <button onClick={(e) => { e.stopPropagation(); navigate('/calendar', { state: { openNewEvent: true } }); }} style={btnStyle}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                    Neuer Termin
                  </button>
                </div>
              )}

              {'isContacts' in mod && (
                <div style={{ marginTop: '0.625rem' }}>
                  <button onClick={(e) => { e.stopPropagation(); navigate('/contacts/new'); }} style={btnStyle}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                    Neuer Kontakt
                  </button>
                </div>
              )}

              {'isContracts' in mod && (
                <div style={{ marginTop: '0.625rem' }}>
                  <button onClick={(e) => { e.stopPropagation(); navigate('/contracts', { state: { openNew: true } }); }} style={btnStyle}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                    Neuer Eintrag
                  </button>
                </div>
              )}

              {'isDj' in mod && (
                <div style={{ marginTop: '0.625rem' }}>
                  {djOverview !== null && (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.2rem', marginBottom: '0.4rem' }}>
                      <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--color-on-surface)', lineHeight: 1 }}>{djOverview.open_requests ?? 0}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>offen</span>
                    </div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); setIsDjAnfrageOpen(true); }} style={btnStyle}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                    Neues Event
                  </button>
                </div>
              )}

              {'isHaushalt' in mod && (
                <div style={{ marginTop: '0.625rem' }}>
                  <button onClick={(e) => { e.stopPropagation(); navigate('/haushalt', { state: { openNew: true } }); }} style={btnStyle}>
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>add</span>
                    Neuer Eintrag
                  </button>
                  {haushaltSaldo !== null && haushaltSaldo.saldo !== 0 && (
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: haushaltSaldo.saldo > 0 ? 'var(--color-primary)' : '#fb923c', marginTop: '0.375rem' }}>
                      {Math.abs(haushaltSaldo.saldo).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € — {haushaltSaldo.saldo > 0 ? 'Julia → Benny' : 'Benny → Julia'}
                    </p>
                  )}
                </div>
              )}

              {'isTimer' in mod && (
                <div style={{ marginTop: '0.625rem' }}>
                  {timerActive ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {timerStatus === 'running' && (
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-secondary)', boxShadow: '0 0 6px rgba(52,181,250,0.7)', flexShrink: 0 }} />
                      )}
                      <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.02em', color: timerStatus === 'running' ? 'var(--color-secondary)' : 'var(--color-primary)' }}>
                        {formatMs(timerDisplay)}
                      </span>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); startTimer(); navigate('/zeiterfassung'); }} style={btnStyle}>
                      <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>play_arrow</span>
                      Starten
                    </button>
                  )}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
      {/* ── Kalender-Agenda (Timeline-Streifen) ─────────── */}
      {agendaEvents !== null && (() => {
        const todayStr = todayLocal();
        // 7 Tages-Slots aufbauen — lokale Zeitzone
        const days = Array.from({ length: 7 }, (_, i) => addDaysLocal(todayStr, i));

        const grouped: Record<string, CalendarEvent[]> = {};
        agendaEvents.forEach(ev => {
          // All-Day-Events kommen als YYYY-MM-DDT22:00:00Z (Vortag in UTC)
          // — daher in lokale Zone konvertieren statt slice(0, 10)
          const day = isoDateLocal(new Date(ev.start_at));
          if (!grouped[day]) grouped[day] = [];
          grouped[day].push(ev);
        });

        const shortDay = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'short' }).toUpperCase().replace('.', '');
        const shortDate = (iso: string) => { const d = new Date(iso + 'T12:00:00'); return `${d.getDate()}.${d.getMonth() + 1}.`; };

        return (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2.5rem', marginBottom: '1.25rem' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--color-outline)', whiteSpace: 'nowrap' }}>
                Diese Woche
              </p>
              <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, var(--color-outline-variant) 0%, transparent 100%)' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '0.5rem' }}>
              {days.map(day => {
                const isToday = day === todayStr;
                const evs = grouped[day] ?? [];
                return (
                  <div
                    key={day}
                    style={{
                      background: isToday ? 'rgba(148,170,255,0.08)' : 'rgba(255,255,255,0.025)',
                      border: `1px solid ${isToday ? 'rgba(148,170,255,0.25)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: '0.75rem',
                      padding: '0.75rem 0.625rem',
                      minHeight: '90px',
                    }}
                  >
                    {/* Tag-Header */}
                    <div style={{ marginBottom: '0.5rem' }}>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: isToday ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', margin: 0 }}>
                        {isToday ? 'HEUTE' : shortDay(day)}
                      </p>
                      <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.1rem', color: isToday ? 'var(--color-primary)' : 'var(--color-on-surface)', lineHeight: 1.1, margin: 0 }}>
                        {shortDate(day)}
                      </p>
                    </div>

                    {/* Events */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {evs.length === 0 ? (
                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--color-outline)', fontStyle: 'italic', margin: 0 }}>–</p>
                      ) : evs.map(ev => {
                        const timeStr = ev.is_all_day ? null : new Date(ev.start_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                        return (
                          <div key={ev.id} style={{
                            background: isToday ? 'rgba(148,170,255,0.1)' : 'rgba(255,255,255,0.04)',
                            borderRadius: '0.35rem',
                            padding: '0.25rem 0.4rem',
                          }}>
                            {timeStr && (
                              <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', fontWeight: 700, color: isToday ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.2 }}>
                                {timeStr}
                              </p>
                            )}
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {ev.title}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* ── Jetzt kündbar (Verträge im Kündigungsfenster) ── */}
      {cancellableContracts.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '2.5rem', marginBottom: '1.25rem' }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.65rem',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: '#fb923c',
              whiteSpace: 'nowrap',
            }}>
              Jetzt kündbar
            </p>
            <div style={{
              flex: 1, height: '1px',
              background: 'linear-gradient(90deg, rgba(251,146,60,0.4) 0%, transparent 100%)',
            }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {cancellableContracts.map(c => (
              <button
                key={c.id}
                className="module-card"
                onClick={() => navigate('/contracts', { state: { segment: 'cancellable' } })}
                style={{ textAlign: 'left', padding: '1rem 1.25rem', cursor: 'pointer' }}
              >
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: '#fb923c', flexShrink: 0 }}>
                    event_available
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '0.85rem',
                    color: 'var(--color-on-surface)', flex: 1, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {c.title}
                  </span>
                  <span style={{
                    fontSize: '0.72rem', color: '#fb923c', fontFamily: 'var(--font-body)',
                    flexShrink: 0, fontWeight: 600,
                  }}>
                    {c.days_to_anniversary != null
                      ? (() => {
                          const noticeDays = (c.cancellation_notice_weeks ?? 4) * 7;
                          if (c.days_to_anniversary <= noticeDays) return 'Frist verpasst';
                          const remaining = c.days_to_anniversary - noticeDays;
                          return `Noch ${remaining} ${remaining === 1 ? 'Tag' : 'Tage'}`;
                        })()
                      : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Bald fällig (Verträge & Fristen) ────────────── */}
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
            Bald fällig
          </p>
          <div style={{
            flex: 1, height: '1px',
            background: 'linear-gradient(90deg, var(--color-outline-variant) 0%, transparent 100%)',
          }} />
        </div>

        {upcomingContracts.length === 0 ? (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'var(--color-on-surface-variant)',
          }}>
            Keine Fristen in den nächsten 30 Tagen
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {upcomingContracts.map(c => {
              const ITEM_TYPE_ICONS: Record<string, string> = {
                Vertrag: 'description', Dokument: 'article', Frist: 'timer',
                Versicherung: 'security', Mitgliedschaft: 'group', Garantie: 'verified', Sonstiges: 'more_horiz',
              };
              const icon = ITEM_TYPE_ICONS[c.item_type] || 'more_horiz';
              const days = c.expiration_date
                ? Math.round((new Date(c.expiration_date).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
                : null;
              const badgeColor = days === null ? 'var(--color-outline)' : days <= 6 ? '#f87171' : days <= 30 ? '#fb923c' : '#4ade80';
              const badgeText = days === null ? '' : days === 0 ? 'Heute' : days < 0 ? `${Math.abs(days)} Tage überfällig` : `in ${days} Tagen`;
              const expFormatted = c.expiration_date
                ? (() => { const d = new Date(c.expiration_date); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`; })()
                : '';
              return (
                <button
                  key={c.id}
                  className="module-card"
                  onClick={() => navigate('/contracts')}
                  style={{ textAlign: 'left', padding: '1rem 1.25rem', cursor: 'pointer' }}
                >
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-primary)', flexShrink: 0 }}>
                      {icon}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '0.85rem',
                      color: 'var(--color-on-surface)', flex: 1, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.title}
                    </span>
                    {badgeText && (
                      <span style={{ fontSize: '0.72rem', color: badgeColor, fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                        {badgeText}
                      </span>
                    )}
                    {expFormatted && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                        {expFormatted}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </>

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
      {isDjAnfrageOpen && (
        <NeueAnfrageModal
          onClose={() => setIsDjAnfrageOpen(false)}
          onCreated={() => { setIsDjAnfrageOpen(false); navigate('/dj/events'); }}
        />
      )}
    </PageWrapper>
  );
}

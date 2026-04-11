import { useState, useEffect, useCallback, useRef } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import {
  fetchEvents, triggerSync, fetchCalendars, createEvent, updateEvent, deleteEvent,
  type CalendarEvent, type KnownCalendar, type CreateEventPayload,
} from '../api/calendar.api';

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function toLocalTimeStr(isoUtc: string): string {
  return new Date(isoUtc).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function isoDateLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function startOfMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  // Fuehrender Padding: Woche startet Montag (0=Mo)
  const startPad = (first.getDay() + 6) % 7;
  for (let i = startPad; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push(d);
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Abschluss-Padding auf 42 Zellen
  while (days.length < 42) {
    const prev = days[days.length - 1];
    const next = new Date(prev); next.setDate(next.getDate() + 1);
    days.push(next);
  }
  return days;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem',
  border: '1px solid var(--color-outline-variant)', background: 'rgba(255,255,255,0.04)',
  color: 'var(--color-on-surface)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.7rem',
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-outline)', marginBottom: '0.375rem',
};

// ── Event-Formular ─────────────────────────────────────────────────────────────

interface EventFormProps {
  calendars: KnownCalendar[];
  initialDate?: string;
  editEvent?: CalendarEvent | null;
  onSaved: (evt: CalendarEvent) => void;
  onDeleted?: (id: number) => void;
  onClose: () => void;
}

function EventForm({ calendars, initialDate, editEvent, onSaved, onDeleted, onClose }: EventFormProps) {
  const today = initialDate ?? isoDateLocal(new Date());
  const [title, setTitle]         = useState(editEvent?.title ?? '');
  const [date, setDate]           = useState(editEvent ? isoDateLocal(new Date(editEvent.start_at)) : today);
  const [startTime, setStartTime] = useState(editEvent ? toLocalTimeStr(editEvent.start_at) : '09:00');
  const [endTime, setEndTime]     = useState(editEvent ? toLocalTimeStr(editEvent.end_at) : '10:00');
  const [isAllDay, setIsAllDay]   = useState(editEvent ? !!editEvent.is_all_day : false);
  const [calName, setCalName]     = useState(editEvent?.calendar_name ?? calendars[0]?.name ?? '');
  const [location, setLocation]   = useState(editEvent?.location ?? '');
  const [notes, setNotes]         = useState(editEvent?.notes ?? '');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !calName) { setError('Titel und Kalender sind Pflichtfelder.'); return; }
    setSaving(true); setError(null);
    try {
      const startISO = isAllDay
        ? `${date}T00:00:00.000Z`
        : new Date(`${date}T${startTime}:00`).toISOString();
      const endISO = isAllDay
        ? `${date}T23:59:59.000Z`
        : new Date(`${date}T${endTime}:00`).toISOString();

      const payload: CreateEventPayload = {
        title: title.trim(), start_at: startISO, end_at: endISO,
        is_all_day: isAllDay ? 1 : 0, calendar_name: calName,
        location: location.trim() || undefined, notes: notes.trim() || undefined,
      };

      let saved: CalendarEvent;
      if (editEvent) {
        saved = await updateEvent(editEvent.id, payload);
      } else {
        saved = await createEvent(payload);
      }
      onSaved(saved);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editEvent || !confirm('Event wirklich loeschen?')) return;
    setSaving(true);
    try {
      await deleteEvent(editEvent.id);
      onDeleted?.(editEvent.id);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      {/* Backdrop */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      {/* Panel */}
      <div style={{
        width: '420px', background: 'var(--color-surface-container)', borderLeft: '1px solid var(--color-outline-variant)',
        padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1.125rem', color: 'var(--color-on-surface)', margin: 0 }}>
            {editEvent ? 'Event bearbeiten' : 'Neues Event'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', fontSize: '1.25rem' }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '0.5rem', background: 'rgba(239,68,68,0.1)', borderRadius: '0.375rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Titel *</label>
            <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="Event-Titel" autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Kalender *</label>
            <select style={{ ...inputStyle, cursor: 'pointer' }} value={calName} onChange={e => setCalName(e.target.value)}>
              {calendars.filter(c => c.enabled).map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Datum</label>
            <input type="date" style={inputStyle} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" id="allday" checked={isAllDay} onChange={e => setIsAllDay(e.target.checked)} />
            <label htmlFor="allday" style={{ ...labelStyle, margin: 0 }}>Ganztaegig</label>
          </div>
          {!isAllDay && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Von</label>
                <input type="time" style={inputStyle} value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Bis</label>
                <input type="time" style={inputStyle} value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
          )}
          <div>
            <label style={labelStyle}>Ort</label>
            <input style={inputStyle} value={location} onChange={e => setLocation(e.target.value)} placeholder="Ort (optional)" />
          </div>
          <div>
            <label style={labelStyle}>Notizen</label>
            <textarea
              style={{ ...inputStyle, resize: 'vertical', minHeight: '4rem' }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Notizen (optional)"
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="submit" disabled={saving} style={{
              flex: 1, padding: '0.625rem 1rem', borderRadius: '0.5rem', border: 'none',
              background: 'var(--color-primary)', color: '#fff', fontFamily: 'var(--font-body)',
              fontSize: '0.875rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}>
              {saving ? 'Speichere…' : editEvent ? 'Speichern' : 'Erstellen'}
            </button>
            {editEvent && (
              <button type="button" onClick={handleDelete} disabled={saving} style={{
                padding: '0.625rem 0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(239,68,68,0.4)',
                background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: saving ? 'not-allowed' : 'pointer',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', lineHeight: 1 }}>delete</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── CalendarPage ───────────────────────────────────────────────────────────────

export function CalendarPage() {
  const today = new Date();
  const [viewYear, setViewYear]         = useState(today.getFullYear());
  const [viewMonth, setViewMonth]       = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string>(isoDateLocal(today));
  const [events, setEvents]             = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars]       = useState<KnownCalendar[]>([]);
  const [newCalendars, setNewCalendars] = useState<string[]>([]);
  const [syncing, setSyncing]           = useState(false);
  const [lastSync, setLastSync]         = useState<string | null>(null);
  const [syncError, setSyncError]       = useState<string | null>(null);
  const [showForm, setShowForm]         = useState(false);
  const [editEvent, setEditEvent]       = useState<CalendarEvent | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Events fuer den aktuellen Monat laden (±1 Monat Puffer)
  const loadEvents = useCallback(async () => {
    const from = new Date(viewYear, viewMonth - 1, 1).toISOString();
    const to   = new Date(viewYear, viewMonth + 2, 0).toISOString();
    try {
      const data = await fetchEvents(from, to);
      setEvents(data);
    } catch { /* zeige Seite trotzdem */ }
  }, [viewYear, viewMonth]);

  // Kalender laden
  const loadCalendars = useCallback(async (checkNew = false) => {
    try {
      const data = await fetchCalendars(checkNew);
      setCalendars(data.known);
      if (checkNew && data.new_calendars.length > 0) {
        setNewCalendars(data.new_calendars);
      }
    } catch { /* ignorieren */ }
  }, []);

  // Sync-Funktion — non-blocking: Backend antwortet sofort mit 202, Sync läuft ~90-140s im Hintergrund
  async function handleSync() {
    setSyncing(true); setSyncError(null);
    try {
      await triggerSync(); // returns 202 immediately
      setLastSync(new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }));
      // Events nach 5s neu laden (Sync braucht ~90-140s — weiteres Polling via Background-Sync)
      setTimeout(() => loadEvents(), 5000);
    } catch (err) {
      setSyncError(String(err));
    } finally {
      setSyncing(false);
    }
  }

  // Beim Laden der Seite: Kalender laden + sofortiger Sync
  useEffect(() => {
    loadCalendars(true);
    handleSync();
    // Polling: alle 60s nach neuen Kalendern schauen
    pollRef.current = setInterval(() => loadCalendars(true), 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const days = startOfMonthDays(viewYear, viewMonth);

  // Events nach Datum gruppieren (Schluessel: YYYY-MM-DD lokal)
  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const key = isoDateLocal(new Date(evt.start_at));
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(evt);
  }

  const selectedEvents = eventsByDate.get(selectedDate) ?? [];

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  return (
    <PageWrapper>
      {/* Neuer-Kalender-Popup */}
      {newCalendars.length > 0 && (
        <div style={{
          position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 100,
          background: 'var(--color-surface-container)', border: '1px solid var(--color-primary)',
          borderRadius: '0.75rem', padding: '1rem 1.25rem', maxWidth: '320px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: '0 0 0.5rem' }}>
            Neue Kalender erkannt:
          </p>
          <ul style={{ margin: '0 0 0.75rem', padding: '0 0 0 1.25rem', color: 'var(--color-primary)', fontSize: '0.85rem' }}>
            {newCalendars.map(n => <li key={n}>{n}</li>)}
          </ul>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', margin: '0 0 0.75rem' }}>
            Fuge sie in{' '}
            <code style={{ background: 'rgba(255,255,255,0.08)', padding: '0 0.25rem', borderRadius: '0.25rem' }}>CALENDAR_NAMES</code>
            {' '}in deiner .env-Datei ein, um sie zu syncen.
          </p>
          <button onClick={() => setNewCalendars([])} style={{
            background: 'none', border: '1px solid var(--color-outline-variant)', borderRadius: '0.375rem',
            padding: '0.25rem 0.75rem', color: 'var(--color-on-surface-variant)', cursor: 'pointer', fontSize: '0.8rem',
          }}>
            Schliessen
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '1.5rem' }}>
        {/* Header-Leiste */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button onClick={prevMonth} style={{
              background: 'none', border: '1px solid var(--color-outline-variant)', borderRadius: '0.375rem',
              padding: '0.25rem 0.5rem', color: 'var(--color-on-surface)', cursor: 'pointer',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', lineHeight: 1 }}>chevron_left</span>
            </button>
            <h2 style={{
              fontFamily: 'var(--font-headline)', fontSize: '1.25rem', color: 'var(--color-on-surface)',
              margin: 0, minWidth: '12rem', textAlign: 'center',
            }}>
              {MONTHS[viewMonth]} {viewYear}
            </h2>
            <button onClick={nextMonth} style={{
              background: 'none', border: '1px solid var(--color-outline-variant)', borderRadius: '0.375rem',
              padding: '0.25rem 0.5rem', color: 'var(--color-on-surface)', cursor: 'pointer',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', lineHeight: 1 }}>chevron_right</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {lastSync && !syncError && (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
                Synced {lastSync}
              </span>
            )}
            {syncError && (
              <span style={{ fontSize: '0.75rem', color: '#ef4444' }} title={syncError}>
                Sync-Fehler
              </span>
            )}
            <button onClick={handleSync} disabled={syncing} style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.5rem 1rem', borderRadius: '0.5rem', border: 'none',
              background: 'var(--color-primary)', color: '#fff',
              fontFamily: 'var(--font-body)', fontSize: '0.85rem',
              cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.7 : 1,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', lineHeight: 1 }}>sync</span>
              {syncing ? 'Syncing…' : 'Sync'}
            </button>
            <button onClick={() => { setEditEvent(null); setShowForm(true); }} style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.5rem 1rem', borderRadius: '0.5rem',
              border: '1px solid var(--color-outline-variant)',
              background: 'rgba(255,255,255,0.04)', color: 'var(--color-on-surface)',
              fontFamily: 'var(--font-body)', fontSize: '0.85rem', cursor: 'pointer',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', lineHeight: 1 }}>add</span>
              Neu
            </button>
          </div>
        </div>

        {/* Monatsgitter + Tagesdetail */}
        <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0 }}>
          {/* Kalender-Gitter */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {/* Wochentag-Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
              {WEEKDAYS.map(d => (
                <div key={d} style={{
                  textAlign: 'center', padding: '0.375rem 0',
                  fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--color-outline)',
                }}>{d}</div>
              ))}
            </div>
            {/* Tages-Zellen */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', flex: 1 }}>
              {days.map((day, i) => {
                const key = isoDateLocal(day);
                const isCurrentMonth = day.getMonth() === viewMonth;
                const isToday = key === isoDateLocal(today);
                const isSelected = key === selectedDate;
                const dayEvents = eventsByDate.get(key) ?? [];

                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDate(key)}
                    style={{
                      minHeight: '64px', borderRadius: '0.5rem', padding: '0.375rem',
                      cursor: 'pointer', position: 'relative',
                      background: isSelected
                        ? 'rgba(139,92,246,0.15)'
                        : isToday
                        ? 'rgba(255,255,255,0.04)'
                        : 'rgba(255,255,255,0.02)',
                      border: isToday
                        ? '2px solid var(--color-primary)'
                        : isSelected
                        ? '1px solid var(--color-primary)'
                        : '1px solid transparent',
                      opacity: isCurrentMonth ? 1 : 0.35,
                    }}
                  >
                    <span style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.8rem',
                      color: isToday ? 'var(--color-primary)' : 'var(--color-on-surface)',
                      fontWeight: isToday ? 700 : 400,
                    }}>
                      {day.getDate()}
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', marginTop: '2px' }}>
                      {dayEvents.slice(0, 3).map(evt => (
                        <div key={evt.id} style={{
                          fontSize: '0.65rem', padding: '1px 4px', borderRadius: '2px',
                          background: 'rgba(139,92,246,0.25)', color: 'var(--color-primary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {evt.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div style={{ fontSize: '0.6rem', color: 'var(--color-outline)' }}>
                          +{dayEvents.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tagesdetail-Panel */}
          <div style={{
            width: '280px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem',
            background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem',
            overflowY: 'auto', maxHeight: '600px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '0.95rem', color: 'var(--color-on-surface)', margin: 0 }}>
                {new Date(selectedDate + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <button
                onClick={() => { setEditEvent(null); setShowForm(true); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>add_circle</span>
              </button>
            </div>
            {selectedEvents.length === 0 ? (
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8rem', margin: 0 }}>Keine Events</p>
            ) : (
              selectedEvents.map(evt => (
                <div
                  key={evt.id}
                  onClick={() => { setEditEvent(evt); setShowForm(true); }}
                  style={{
                    padding: '0.625rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-outline-variant)',
                    borderLeft: '3px solid var(--color-primary)',
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', fontWeight: 600 }}>
                    {evt.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: '2px' }}>
                    {evt.is_all_day ? 'Ganztaegig' : `${toLocalTimeStr(evt.start_at)} – ${toLocalTimeStr(evt.end_at)}`}
                  </div>
                  {evt.location && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-outline)', marginTop: '2px' }}>
                      {evt.location}
                    </div>
                  )}
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-outline)', marginTop: '4px' }}>
                    {evt.calendar_name}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Event-Formular Slide-Panel */}
      {showForm && (
        <EventForm
          calendars={calendars}
          initialDate={selectedDate}
          editEvent={editEvent}
          onSaved={(saved) => {
            setEvents(prev => {
              const idx = prev.findIndex(e => e.id === saved.id);
              return idx >= 0 ? prev.map(e => e.id === saved.id ? saved : e) : [...prev, saved];
            });
            setShowForm(false);
          }}
          onDeleted={(id) => {
            setEvents(prev => prev.filter(e => e.id !== id));
            setShowForm(false);
          }}
          onClose={() => setShowForm(false)}
        />
      )}
    </PageWrapper>
  );
}

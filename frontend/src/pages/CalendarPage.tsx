import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
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

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(d.getDate() + n);
  return result;
}

function startOfMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const startPad = (first.getDay() + 6) % 7;
  for (let i = startPad; i > 0; i--) {
    const d = new Date(year, month, 1 - i);
    days.push(d);
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length < 42) {
    const prev = days[days.length - 1];
    const next = new Date(prev); next.setDate(next.getDate() + 1);
    days.push(next);
  }
  return days;
}

function calendarColor(calName: string, calendars: KnownCalendar[]): string {
  const cal = calendars.find(c => c.name === calName);
  return cal?.color ?? 'var(--color-primary)';
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const HOUR_START = 7;
const HOUR_END = 22;
const SLOT_HEIGHT = 48; // px per hour

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
  const [modalPos, setModalPos]   = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  function handleHeaderMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const el = (e.currentTarget as HTMLElement).closest('[data-modal]') as HTMLElement | null;
    const rect = el ? el.getBoundingClientRect() : { left: window.innerWidth / 2, top: window.innerHeight / 2 };
    dragRef.current = { startX: e.clientX, startY: e.clientY, initX: rect.left, initY: rect.top };
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return;
      setModalPos({ x: dragRef.current.initX + ev.clientX - dragRef.current.startX, y: dragRef.current.initY + ev.clientY - dragRef.current.startY });
    }
    function onUp() {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, pointerEvents: 'auto' }}>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      {/* Modal */}
      <div
        data-modal
        style={modalPos ? {
          position: 'fixed', left: modalPos.x, top: modalPos.y,
          width: 'min(460px, 92vw)', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--color-surface-container)', borderRadius: '0.75rem',
          border: '1px solid var(--color-outline-variant)', boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', zIndex: 51,
        } : {
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(460px, 92vw)', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--color-surface-container)', borderRadius: '0.75rem',
          border: '1px solid var(--color-outline-variant)', boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
          display: 'flex', flexDirection: 'column', zIndex: 51,
        }}
      >
        <div
          onMouseDown={handleHeaderMouseDown}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-outline-variant)',
            cursor: 'grab', userSelect: 'none', flexShrink: 0 }}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem', color: 'var(--color-on-surface)', margin: 0, fontWeight: 700 }}>
            {editEvent ? 'Event bearbeiten' : 'Neues Event'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

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
    </div>
  );
}

// ── View-Typen ─────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'list' | 'today';

// ── Monat-View ─────────────────────────────────────────────────────────────────

interface MonthViewProps {
  viewYear: number;
  viewMonth: number;
  today: Date;
  selectedDate: string;
  eventsByDate: Map<string, CalendarEvent[]>;
  calendars: KnownCalendar[];
  onSelectDate: (d: string) => void;
  onEditEvent: (evt: CalendarEvent) => void;
  onNewEvent: () => void;
  onPrev: () => void;
  onNext: () => void;
}

function MonthView({ viewYear, viewMonth, today, selectedDate, eventsByDate, calendars, onSelectDate, onEditEvent, onNewEvent, onPrev, onNext }: MonthViewProps) {
  const days = startOfMonthDays(viewYear, viewMonth);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, minHeight: 0 }}>
      {/* Navigations-Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={onPrev} style={{
          background: 'none', border: '1px solid var(--color-outline-variant)', borderRadius: '0.375rem',
          padding: '0.25rem 0.5rem', color: 'var(--color-on-surface)', cursor: 'pointer',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', lineHeight: 1 }}>chevron_left</span>
        </button>
        <h2 style={{
          fontFamily: 'var(--font-headline)', fontSize: '1.1rem', color: 'var(--color-on-surface)',
          margin: 0, minWidth: '11rem', textAlign: 'center',
        }}>
          {MONTHS[viewMonth]} {viewYear}
        </h2>
        <button onClick={onNext} style={{
          background: 'none', border: '1px solid var(--color-outline-variant)', borderRadius: '0.375rem',
          padding: '0.25rem 0.5rem', color: 'var(--color-on-surface)', cursor: 'pointer',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', lineHeight: 1 }}>chevron_right</span>
        </button>
      </div>

      {/* Gitter + Tagesdetail */}
      <div style={{ display: 'flex', gap: '1.25rem', flex: 1, minHeight: 0 }}>
        {/* Kalender-Gitter */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {WEEKDAYS.map(d => (
              <div key={d} style={{
                textAlign: 'center', padding: '0.375rem 0',
                fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--color-outline)',
              }}>{d}</div>
            ))}
          </div>
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
                  onClick={() => onSelectDate(key)}
                  style={{
                    minHeight: '64px', borderRadius: '0.5rem', padding: '0.375rem',
                    cursor: 'pointer', position: 'relative',
                    background: isSelected
                      ? 'rgba(204,151,255,0.12)'
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
                    {dayEvents.slice(0, 3).map(evt => {
                      const color = calendarColor(evt.calendar_name, calendars);
                      return (
                        <div key={evt.id} style={{
                          fontSize: '0.65rem', padding: '1px 4px', borderRadius: '2px',
                          background: `${color}22`,
                          color: color,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {evt.title}
                        </div>
                      );
                    })}
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
          width: '272px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem',
          background: 'var(--color-surface-container)', borderRadius: '0.75rem', padding: '1.25rem',
          overflowY: 'auto', maxHeight: '560px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: 0 }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            <button
              onClick={onNewEvent}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>add_circle</span>
            </button>
          </div>
          {selectedEvents.length === 0 ? (
            <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8rem', margin: 0 }}>Keine Events</p>
          ) : (
            selectedEvents.map(evt => {
              const color = calendarColor(evt.calendar_name, calendars);
              return (
                <div
                  key={evt.id}
                  onClick={() => onEditEvent(evt)}
                  style={{
                    padding: '0.625rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-outline-variant)',
                    borderLeft: `3px solid ${color}`,
                  }}
                >
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', fontWeight: 600 }}>
                    {evt.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: '2px' }}>
                    {evt.is_all_day ? 'Ganztaegig' : `${toLocalTimeStr(evt.start_at)} – ${toLocalTimeStr(evt.end_at)}`}
                  </div>
                  {evt.location && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-outline)', marginTop: '2px' }}>{evt.location}</div>
                  )}
                  <div style={{ fontSize: '0.68rem', color, marginTop: '4px', opacity: 0.8 }}>
                    {evt.calendar_name}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Woche-View ─────────────────────────────────────────────────────────────────

interface WeekViewProps {
  weekStart: Date;
  today: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  calendars: KnownCalendar[];
  onEditEvent: (evt: CalendarEvent) => void;
  onPrev: () => void;
  onNext: () => void;
}

function WeekView({ weekStart, today, eventsByDate, calendars, onEditEvent, onPrev, onNext }: WeekViewProps) {
  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) weekDays.push(addDays(weekStart, i));

  const hours: number[] = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);

  const weekTitle = `${isoDateLocal(weekStart)} — ${isoDateLocal(addDays(weekStart, 6))}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, minHeight: 0 }}>
      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button onClick={onPrev} style={{
          background: 'none', border: '1px solid var(--color-outline-variant)', borderRadius: '0.375rem',
          padding: '0.25rem 0.5rem', color: 'var(--color-on-surface)', cursor: 'pointer',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', lineHeight: 1 }}>chevron_left</span>
        </button>
        <span style={{ fontFamily: 'var(--font-headline)', fontSize: '1rem', color: 'var(--color-on-surface)', minWidth: '17rem', textAlign: 'center' }}>
          {weekTitle}
        </span>
        <button onClick={onNext} style={{
          background: 'none', border: '1px solid var(--color-outline-variant)', borderRadius: '0.375rem',
          padding: '0.25rem 0.5rem', color: 'var(--color-on-surface)', cursor: 'pointer',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', lineHeight: 1 }}>chevron_right</span>
        </button>
      </div>

      {/* Ganztaegige Events */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', gap: '2px' }}>
        <div /> {/* Zeitachsen-Platzhalter */}
        {weekDays.map((day, di) => {
          const key = isoDateLocal(day);
          const allDayEvts = (eventsByDate.get(key) ?? []).filter(e => e.is_all_day);
          return (
            <div key={di} style={{ minHeight: allDayEvts.length > 0 ? '28px' : '8px' }}>
              {allDayEvts.map(evt => {
                const color = calendarColor(evt.calendar_name, calendars);
                return (
                  <div key={evt.id} onClick={() => onEditEvent(evt)} style={{
                    fontSize: '0.65rem', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer',
                    background: `${color}33`, color, marginBottom: '2px',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {evt.title}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Spalten-Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', gap: '2px' }}>
        <div />
        {weekDays.map((day, di) => {
          const key = isoDateLocal(day);
          const isToday = key === isoDateLocal(today);
          return (
            <div key={di} style={{ textAlign: 'center', padding: '0.25rem 0' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-outline)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {WEEKDAYS[di]}
              </div>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: '0.85rem', fontWeight: isToday ? 700 : 400,
                color: isToday ? 'var(--color-primary)' : 'var(--color-on-surface)',
              }}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Zeit-Raster */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, 1fr)', gap: '2px', position: 'relative' }}>
          {/* Zeitachse */}
          <div>
            {hours.map(h => (
              <div key={h} style={{ height: SLOT_HEIGHT, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: '6px' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--color-outline)', lineHeight: 1, marginTop: '2px' }}>
                  {String(h).padStart(2, '0')}:00
                </span>
              </div>
            ))}
          </div>

          {/* Tages-Spalten */}
          {weekDays.map((day, di) => {
            const key = isoDateLocal(day);
            const timedEvts = (eventsByDate.get(key) ?? []).filter(e => !e.is_all_day);
            const totalHours = HOUR_END - HOUR_START + 1;
            return (
              <div key={di} style={{ position: 'relative', height: SLOT_HEIGHT * totalHours, borderLeft: '1px solid var(--color-outline-variant)' }}>
                {/* Stunden-Linien */}
                {hours.map(h => (
                  <div key={h} style={{
                    position: 'absolute', top: (h - HOUR_START) * SLOT_HEIGHT,
                    left: 0, right: 0, height: 1, background: 'var(--color-outline-variant)', opacity: 0.4,
                  }} />
                ))}
                {/* Events */}
                {timedEvts.map(evt => {
                  const start = new Date(evt.start_at);
                  const end = new Date(evt.end_at);
                  const startMinFrom7 = (start.getHours() - HOUR_START) * 60 + start.getMinutes();
                  const durationMin = Math.max((end.getTime() - start.getTime()) / 60000, 15);
                  const top = Math.max(startMinFrom7 / 60 * SLOT_HEIGHT, 0);
                  const height = Math.max(durationMin / 60 * SLOT_HEIGHT, 20);
                  const color = calendarColor(evt.calendar_name, calendars);
                  return (
                    <div
                      key={evt.id}
                      onClick={() => onEditEvent(evt)}
                      title={`${evt.title}\n${toLocalTimeStr(evt.start_at)} – ${toLocalTimeStr(evt.end_at)}`}
                      style={{
                        position: 'absolute', top, left: '2px', right: '2px', height,
                        background: `${color}28`, borderLeft: `3px solid ${color}`,
                        borderRadius: '3px', padding: '2px 4px', overflow: 'hidden',
                        cursor: 'pointer', zIndex: 1,
                      }}
                    >
                      <div style={{ fontSize: '0.65rem', color, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {evt.title}
                      </div>
                      {height > 28 && (
                        <div style={{ fontSize: '0.6rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.2 }}>
                          {toLocalTimeStr(evt.start_at)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Liste-View ─────────────────────────────────────────────────────────────────

interface ListViewProps {
  today: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  calendars: KnownCalendar[];
  onEditEvent: (evt: CalendarEvent) => void;
}

function ListView({ today, eventsByDate, calendars, onEditEvent }: ListViewProps) {
  const listDays: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    listDays.push(isoDateLocal(d));
  }
  const daysWithEvents = listDays.filter(d => (eventsByDate.get(d) ?? []).length > 0);

  if (daysWithEvents.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
        Keine Events in den naechsten 30 Tagen
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {daysWithEvents.map(day => {
        const dayEvts = (eventsByDate.get(day) ?? []).slice().sort((a, b) => {
          if (a.is_all_day && !b.is_all_day) return -1;
          if (!a.is_all_day && b.is_all_day) return 1;
          return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
        });
        return (
          <div key={day}>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600,
              color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.08em',
              marginBottom: '0.5rem', paddingBottom: '0.25rem',
              borderBottom: '1px solid var(--color-outline-variant)',
            }}>
              {new Date(day + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {dayEvts.map(evt => {
                const color = calendarColor(evt.calendar_name, calendars);
                return (
                  <div
                    key={evt.id}
                    onClick={() => onEditEvent(evt)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.5rem 0.75rem', borderRadius: '0.5rem', cursor: 'pointer',
                      background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${color}`,
                      border: '1px solid var(--color-outline-variant)',
                      borderLeftWidth: '3px', borderLeftColor: color,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)', fontWeight: 500 }}>
                        {evt.title}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: '1px' }}>
                        {evt.is_all_day ? 'Ganztaegig' : `${toLocalTimeStr(evt.start_at)} – ${toLocalTimeStr(evt.end_at)}`}
                        {' · '}
                        <span style={{ color }}>{evt.calendar_name}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Heute-View ─────────────────────────────────────────────────────────────────

interface TodayViewProps {
  today: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  calendars: KnownCalendar[];
  onEditEvent: (evt: CalendarEvent) => void;
}

function TodayView({ today, eventsByDate, calendars, onEditEvent }: TodayViewProps) {
  const key = isoDateLocal(today);
  const todayEvts = (eventsByDate.get(key) ?? []).slice().sort((a, b) => {
    if (a.is_all_day && !b.is_all_day) return -1;
    if (!a.is_all_day && b.is_all_day) return 1;
    return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: 0 }}>
      <div style={{ fontFamily: 'var(--font-headline)', fontSize: '1.1rem', color: 'var(--color-on-surface)', fontWeight: 700 }}>
        {today.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        <span style={{ fontSize: '0.7rem', marginLeft: '0.75rem', color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Heute
        </span>
      </div>

      {todayEvts.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
          Heute keine Events
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {todayEvts.map(evt => {
            const color = calendarColor(evt.calendar_name, calendars);
            return (
              <div
                key={evt.id}
                onClick={() => onEditEvent(evt)}
                style={{
                  padding: '0.75rem 1rem', borderRadius: '0.625rem', cursor: 'pointer',
                  background: `${color}10`, border: '1px solid var(--color-outline-variant)',
                  borderLeft: `4px solid ${color}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0, display: 'inline-block' }} />
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                    {evt.title}
                  </div>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-on-surface-variant)', marginLeft: '1.125rem' }}>
                  {evt.is_all_day ? 'Ganztaegig' : `${toLocalTimeStr(evt.start_at)} – ${toLocalTimeStr(evt.end_at)}`}
                  {' · '}
                  <span style={{ color }}>{evt.calendar_name}</span>
                </div>
                {evt.location && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-outline)', marginTop: '0.25rem', marginLeft: '1.125rem' }}>
                    {evt.location}
                  </div>
                )}
                {evt.notes && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-outline)', marginTop: '0.125rem', marginLeft: '1.125rem', fontStyle: 'italic' }}>
                    {evt.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── CalendarPage ───────────────────────────────────────────────────────────────

export function CalendarPage() {
  const today = new Date();
  const location = useLocation();
  const [viewMode, setViewMode]         = useState<ViewMode>('month');
  const [viewYear, setViewYear]         = useState(today.getFullYear());
  const [viewMonth, setViewMonth]       = useState(today.getMonth());
  const [viewWeekStart, setViewWeekStart] = useState(() => getMonday(today));
  const [selectedDate, setSelectedDate] = useState<string>(isoDateLocal(today));
  const [events, setEvents]             = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars]       = useState<KnownCalendar[]>([]);
  const [newCalendars, setNewCalendars] = useState<string[]>([]);
  const [syncing, setSyncing]           = useState(false);
  const [lastSync, setLastSync]         = useState<string | null>(null);
  const [syncError, setSyncError]       = useState<string | null>(null);
  const [syncToast, setSyncToast]       = useState<{ msg: string; visible: boolean }>({ msg: '', visible: false });
  const [showForm, setShowForm]         = useState(false);
  const [editEvent, setEditEvent]       = useState<CalendarEvent | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Vom Dashboard mit openNewEvent navigiert → Formular direkt öffnen
  useEffect(() => {
    if ((location.state as { openNewEvent?: boolean } | null)?.openNewEvent) {
      setShowForm(true);
      setEditEvent(null);
      window.history.replaceState({}, document.title);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadEvents = useCallback(async () => {
    const from = new Date(viewYear, viewMonth - 1, 1).toISOString();
    const to   = new Date(viewYear, viewMonth + 2, 0).toISOString();
    try {
      const data = await fetchEvents(from, to);
      setEvents(data);
    } catch { /* zeige Seite trotzdem */ }
  }, [viewYear, viewMonth]);

  const loadCalendars = useCallback(async (checkNew = false) => {
    try {
      const data = await fetchCalendars(checkNew);
      setCalendars(data.known);
      if (checkNew && data.new_calendars.length > 0) {
        setNewCalendars(data.new_calendars);
      }
    } catch { /* ignorieren */ }
  }, []);

  async function handleSync() {
    setSyncing(true); setSyncError(null);
    try {
      await triggerSync();
      const timeStr = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      setLastSync(timeStr);
      setSyncToast({ msg: `Sync gestartet — ${timeStr}`, visible: true });
      setTimeout(() => setSyncToast(t => ({ ...t, visible: false })), 3500);
      [5, 30, 60, 90, 120, 150].forEach(sec => setTimeout(() => loadEvents(), sec * 1000));
    } catch (err) {
      setSyncError(String(err));
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    loadCalendars(true);
    handleSync();
    pollRef.current = setInterval(() => { loadCalendars(true); loadEvents(); }, 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    const key = isoDateLocal(new Date(evt.start_at));
    if (!eventsByDate.has(key)) eventsByDate.set(key, []);
    eventsByDate.get(key)!.push(evt);
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }
  function prevWeek() { setViewWeekStart(d => addDays(d, -7)); }
  function nextWeek() { setViewWeekStart(d => addDays(d, 7)); }

  function openEdit(evt: CalendarEvent) { setEditEvent(evt); setShowForm(true); }
  function openNew() { setEditEvent(null); setShowForm(true); }

  return (
    <PageWrapper>
      {/* Seitentitel */}
      <div style={{
        padding: '0.875rem 1.5rem',
        borderBottom: '1px solid var(--color-outline-variant)',
        background: 'var(--color-surface-container-low)',
        display: 'flex', alignItems: 'center', flexShrink: 0,
      }}>
        <span className="gradient-text" style={{
          fontFamily: 'var(--font-headline)', fontWeight: 800,
          fontSize: '1.5rem', letterSpacing: '-0.01em',
        }}>
          Kalender
        </span>
        {lastSync && (
          <span style={{
            marginLeft: '0.75rem', fontSize: '0.7rem', color: 'var(--color-on-surface-variant)',
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-outline-variant)',
            borderRadius: '999px', padding: '0.2rem 0.6rem',
          }}>
            Synced {lastSync}
          </span>
        )}
      </div>

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

      {/* Sync-Toast */}
      {syncToast.visible && (
        <div style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 200,
          background: 'var(--color-surface-container-high)',
          border: '1px solid var(--color-outline-variant)',
          borderLeft: '3px solid var(--color-primary)',
          borderRadius: '0.625rem', padding: '0.75rem 1rem',
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          fontFamily: 'var(--font-body)', fontSize: '0.8rem',
          color: 'var(--color-on-surface)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-primary)' }}>sync</span>
          {syncToast.msg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '1rem', padding: '1.25rem 1.5rem', minHeight: 0 }}>
        {/* Toolbar: View-Toggle + Sync + Neu */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          {/* View-Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Monat / Woche / Liste */}
            <div style={{ display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', padding: '3px' }}>
              {(['month', 'week', 'list'] as ViewMode[]).map(v => (
                <button key={v} onClick={() => setViewMode(v)} style={{
                  padding: '0.375rem 1rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: viewMode === v ? 700 : 500,
                  background: viewMode === v ? 'var(--color-primary)' : 'transparent',
                  color: viewMode === v ? '#000' : 'var(--color-on-surface-variant)',
                  boxShadow: viewMode === v ? '0 0 14px rgba(204,151,255,0.55)' : 'none',
                  transition: 'all 0.15s',
                }}>
                  {v === 'month' ? 'Monat' : v === 'week' ? 'Woche' : 'Liste'}
                </button>
              ))}
            </div>
            {/* Heute — separat, pink glow */}
            <button onClick={() => setViewMode('today')} style={{
              padding: '0.375rem 1rem', borderRadius: '9999px', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: '0.8rem', fontWeight: viewMode === 'today' ? 700 : 500,
              background: viewMode === 'today'
                ? 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))'
                : 'rgba(255,255,255,0.06)',
              color: viewMode === 'today' ? '#000' : 'var(--color-on-surface-variant)',
              boxShadow: viewMode === 'today' ? '0 0 18px rgba(204,151,255,0.6)' : 'none',
              transition: 'all 0.15s',
            }}>
              Heute
            </button>
          </div>

          {/* Sync + Neu */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
            <button onClick={openNew} style={{
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

        {/* Views */}
        {viewMode === 'month' && (
          <MonthView
            viewYear={viewYear}
            viewMonth={viewMonth}
            today={today}
            selectedDate={selectedDate}
            eventsByDate={eventsByDate}
            calendars={calendars}
            onSelectDate={setSelectedDate}
            onEditEvent={openEdit}
            onNewEvent={openNew}
            onPrev={prevMonth}
            onNext={nextMonth}
          />
        )}
        {viewMode === 'week' && (
          <WeekView
            weekStart={viewWeekStart}
            today={today}
            eventsByDate={eventsByDate}
            calendars={calendars}
            onEditEvent={openEdit}
            onPrev={prevWeek}
            onNext={nextWeek}
          />
        )}
        {viewMode === 'list' && (
          <ListView
            today={today}
            eventsByDate={eventsByDate}
            calendars={calendars}
            onEditEvent={openEdit}
          />
        )}
        {viewMode === 'today' && (
          <TodayView
            today={today}
            eventsByDate={eventsByDate}
            calendars={calendars}
            onEditEvent={openEdit}
          />
        )}
      </div>

      {/* Event-Formular */}
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

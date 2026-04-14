import { useState, useEffect, useCallback } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import {
  fetchEvents, fetchCalendars, createEvent, deleteEvent, forceSync, updateCalendarVisibility,
  type CalendarEvent, type Calendar, type CreateEventPayload,
} from '../api/calendar.api';

// ── Konstanten ─────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MONTHS = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

// ── View-Typ ───────────────────────────────────────────────────────────────────

type ViewMode = 'month' | 'week' | 'day';

// ── Styles ─────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.625rem 0.875rem', borderRadius: '0.5rem',
  border: '1px solid var(--color-outline-variant)', background: 'rgba(255,255,255,0.04)',
  color: 'var(--color-on-surface)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', outline: 'none',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-body)', fontSize: '0.7rem',
  letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-outline)', marginBottom: '0.375rem',
};

// ── Hilfsfunktionen ────────────────────────────────────────────────────────────

function isoDateLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toLocalTimeStr(isoUtc: string): string {
  return new Date(isoUtc).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function buildMonthGrid(year: number, month: number): Date[] {
  const days: Date[] = [];
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  // Pad to Monday (0=So -> 6, 1=Mo -> 0, ...)
  const startPad = (first.getDay() + 6) % 7;
  for (let i = startPad; i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length < 42) {
    const prev = days[days.length - 1];
    const next = new Date(prev);
    next.setDate(next.getDate() + 1);
    days.push(next);
  }
  return days;
}

function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const evt of events) {
    // Lokale Datum verwenden (nicht UTC slice) — Ganztages-Events kommen als 22:00 UTC (= 00:00 CET)
    const key = isoDateLocal(new Date(evt.start_at));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(evt);
  }
  return map;
}

function calendarColor(calendars: Calendar[], calId: string | null, calName?: string): string {
  if (calId) {
    const cal = calendars.find(c => c.id === calId);
    if (cal?.color) return cal.color;
  }
  if (calName) {
    const cal = calendars.find(c => c.title === calName);
    if (cal?.color) return cal.color;
  }
  return 'var(--color-primary)';
}

function monthRange(year: number, month: number): { from: string; to: string } {
  const last = new Date(year, month + 1, 0).getDate();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to   = `${year}-${String(month + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { from, to };
}

function weekRangeLabel(d: Date): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mDay = monday.getDate();
  const sDay = sunday.getDate();
  const mMonth = MONTHS[monday.getMonth()];
  const sMonth = MONTHS[sunday.getMonth()];
  const yr = sunday.getFullYear();
  if (monday.getMonth() === sunday.getMonth()) {
    return `${mDay}. – ${sDay}. ${mMonth} ${yr}`;
  }
  return `${mDay}. ${mMonth} – ${sDay}. ${sMonth} ${yr}`;
}

function dayLabel(d: Date): string {
  const wdIdx = (d.getDay() + 6) % 7;
  return `${WEEKDAYS_LONG[wdIdx]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── WeekView ───────────────────────────────────────────────────────────────────

interface WeekViewProps {
  viewDate: Date;
  filteredEvents: CalendarEvent[];
  calendars: Calendar[];
  onDayClick: (d: Date) => void;
}

function WeekView({ viewDate, filteredEvents, calendars, onDayClick }: WeekViewProps) {
  const monday = new Date(viewDate);
  monday.setDate(viewDate.getDate() - ((viewDate.getDay() + 6) % 7));

  const weekDays: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDays.push(d);
  }

  const eventsByDate = groupEventsByDate(filteredEvents);
  const todayStr = isoDateLocal(new Date());

  return (
    <div style={{
      background: 'var(--color-surface-container)', borderRadius: '0.75rem',
      border: '1px solid var(--color-outline-variant)', overflow: 'hidden',
    }}>
      {/* Wochentags-Header mit Datum */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {weekDays.map((day, i) => {
          const dayStr = isoDateLocal(day);
          const isToday = dayStr === todayStr;
          return (
            <div key={i} style={{
              padding: '0.75rem 0.5rem', textAlign: 'center',
              borderBottom: '1px solid var(--color-outline-variant)',
              borderRight: i < 6 ? '1px solid var(--color-outline-variant)' : 'none',
            }}>
              <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-outline)', fontWeight: 600 }}>
                {WEEKDAYS[i]}
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: '50%', marginTop: '0.25rem',
                fontSize: '0.9rem', fontWeight: isToday ? 700 : 400,
                color: isToday ? 'var(--color-on-primary)' : 'var(--color-on-surface)',
                background: isToday ? 'var(--color-primary)' : 'transparent',
              }}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Event-Spalten */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', minHeight: 300 }}>
        {weekDays.map((day, i) => {
          const dayStr = isoDateLocal(day);
          const dayEvts = eventsByDate.get(dayStr) ?? [];
          const sorted = [...dayEvts].sort((a, b) => {
            if (a.is_all_day && !b.is_all_day) return -1;
            if (!a.is_all_day && b.is_all_day) return 1;
            return a.start_at.localeCompare(b.start_at);
          });

          return (
            <div
              key={i}
              onClick={() => onDayClick(day)}
              style={{
                padding: '0.5rem 0.375rem', cursor: 'pointer',
                borderRight: i < 6 ? '1px solid var(--color-outline-variant)' : 'none',
                display: 'flex', flexDirection: 'column', gap: '4px',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {sorted.map(evt => {
                const color = calendarColor(calendars, evt.calendar_id, evt.calendar_name);
                return (
                  <div key={evt.apple_uid || evt.id} style={{
                    fontSize: '0.7rem', padding: '3px 5px', borderRadius: 4,
                    borderLeft: `3px solid ${color}`, background: `${color}22`,
                    color: 'var(--color-on-surface)', overflow: 'hidden',
                    whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }} title={evt.title}>
                    {evt.is_all_day ? '' : `${toLocalTimeStr(evt.start_at)} `}{evt.title}
                  </div>
                );
              })}
              {sorted.length === 0 && (
                <div style={{ fontSize: '0.7rem', color: 'var(--color-outline)', opacity: 0.5, textAlign: 'center', marginTop: '1rem' }}>—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DayView ────────────────────────────────────────────────────────────────────

interface DayViewProps {
  viewDate: Date;
  filteredEvents: CalendarEvent[];
  calendars: Calendar[];
}

function DayView({ viewDate, filteredEvents, calendars }: DayViewProps) {
  const dayStr = isoDateLocal(viewDate);
  const dayEvts = (groupEventsByDate(filteredEvents).get(dayStr) ?? [])
    .sort((a, b) => {
      if (a.is_all_day && !b.is_all_day) return -1;
      if (!a.is_all_day && b.is_all_day) return 1;
      return a.start_at.localeCompare(b.start_at);
    });

  return (
    <div style={{
      background: 'var(--color-surface-container)', borderRadius: '0.75rem',
      border: '1px solid var(--color-outline-variant)', overflow: 'hidden',
    }}>
      {dayEvts.length === 0 ? (
        <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-outline)', fontSize: '0.875rem' }}>
          Keine Termine an diesem Tag.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {dayEvts.map((evt, idx) => {
            const color = calendarColor(calendars, evt.calendar_id, evt.calendar_name);
            const timeStr = evt.is_all_day ? 'Ganztägig' : `${toLocalTimeStr(evt.start_at)} – ${toLocalTimeStr(evt.end_at)}`;
            return (
              <div key={evt.apple_uid || evt.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                padding: '0.875rem 1.25rem',
                borderBottom: idx < dayEvts.length - 1 ? '1px solid var(--color-outline-variant)' : 'none',
              }}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: color, flexShrink: 0, marginTop: 4,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-on-surface)' }}>
                    {evt.title}
                  </p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--color-outline)' }}>
                    {timeStr}
                  </p>
                  {evt.location && (
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--color-outline)' }}>
                      {evt.location}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── EventForm ──────────────────────────────────────────────────────────────────

interface EventFormProps {
  calendars: Calendar[];
  initialDate: string;
  onSaved: (evt: CalendarEvent) => void;
  onClose: () => void;
}

function EventForm({ calendars, initialDate, onSaved, onClose }: EventFormProps) {
  const [title, setTitle]         = useState('');
  const [date, setDate]           = useState(initialDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime]     = useState('10:00');
  const [isAllDay, setIsAllDay]   = useState(false);
  const [calId, setCalId]         = useState(calendars[0]?.id ?? '');
  const [location, setLocation]   = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!calId && calendars.length > 0) setCalId(calendars[0].id);
  }, [calendars, calId]);

  async function handleSave() {
    if (!title.trim()) { setError('Titel ist erforderlich'); return; }
    if (!calId)        { setError('Bitte einen Kalender wählen'); return; }

    setSaving(true);
    setError(null);
    try {
      let start_at: string;
      let end_at: string;

      if (isAllDay) {
        start_at = `${date}T00:00:00Z`;
        end_at   = `${date}T23:59:59Z`;
      } else {
        start_at = `${date}T${startTime}:00Z`;
        end_at   = `${date}T${endTime}:00Z`;
      }

      const payload: CreateEventPayload = {
        title: title.trim(),
        start_at,
        end_at,
        calendar_id: calId,
        is_all_day: isAllDay,
        location: location.trim() || undefined,
      };

      const evt = await createEvent(payload);
      onSaved(evt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label style={labelStyle}>Titel</label>
        <input
          style={inputStyle}
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Termintitel"
          autoFocus
        />
      </div>

      <div>
        <label style={labelStyle}>Datum</label>
        <input
          type="date"
          style={inputStyle}
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          type="checkbox"
          id="allday-check"
          checked={isAllDay}
          onChange={e => setIsAllDay(e.target.checked)}
          style={{ accentColor: 'var(--color-primary)', width: 16, height: 16 }}
        />
        <label htmlFor="allday-check" style={{ ...labelStyle, margin: 0, cursor: 'pointer' }}>
          Ganztägig
        </label>
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
        <label style={labelStyle}>Kalender</label>
        <select
          style={{ ...inputStyle, cursor: 'pointer' }}
          value={calId}
          onChange={e => setCalId(e.target.value)}
        >
          {calendars.map(cal => (
            <option key={cal.id} value={cal.id}>
              {cal.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>Ort (optional)</label>
        <input
          style={inputStyle}
          value={location}
          onChange={e => setLocation(e.target.value)}
          placeholder="Ort eingeben"
        />
      </div>

      {error && (
        <p style={{ color: 'var(--color-error)', fontSize: '0.8rem', margin: 0 }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.5rem' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1, padding: '0.625rem 1rem', borderRadius: '0.5rem',
            background: 'var(--color-primary)', color: 'var(--color-on-primary)',
            border: 'none', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
            fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Speichern...' : 'Speichern'}
        </button>
        <button
          onClick={onClose}
          style={{
            flex: 1, padding: '0.625rem 1rem', borderRadius: '0.5rem',
            background: 'rgba(255,255,255,0.06)', color: 'var(--color-on-surface)',
            border: '1px solid var(--color-outline-variant)',
            fontFamily: 'var(--font-body)', fontSize: '0.875rem', cursor: 'pointer',
          }}
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ── DaySlideOver ───────────────────────────────────────────────────────────────

interface DaySlideOverProps {
  date: Date;
  events: CalendarEvent[];
  calendars: Calendar[];
  onClose: () => void;
  onEventDeleted: (appleUid: string) => void;
  onEventCreated: (evt: CalendarEvent) => void;
}

function DaySlideOver({ date, events, calendars, onClose, onEventDeleted, onEventCreated }: DaySlideOverProps) {
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const weekdayIdx = (date.getDay() + 6) % 7; // 0=Mo
  const weekdayName = WEEKDAYS_LONG[weekdayIdx];
  const dateStr = `${weekdayName}, ${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

  const sortedEvents = [...events].sort((a, b) => {
    if (a.is_all_day && !b.is_all_day) return -1;
    if (!a.is_all_day && b.is_all_day) return 1;
    return a.start_at.localeCompare(b.start_at);
  });

  async function handleDelete(evt: CalendarEvent) {
    if (!window.confirm(`Termin "${evt.title}" wirklich löschen?`)) return;
    setDeleting(evt.apple_uid);
    try {
      await deleteEvent(evt.apple_uid);
      onEventDeleted(evt.apple_uid);
    } catch (err) {
      alert('Löschen fehlgeschlagen: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40,
        }}
      />

      {/* SlideOver Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 400,
          background: 'var(--color-surface-container-high)',
          borderLeft: '1px solid var(--color-outline-variant)',
          zIndex: 50, display: 'flex', flexDirection: 'column',
          boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
          animation: 'slideInRight 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-outline-variant)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-outline)' }}>
              Tagesansicht
            </p>
            <h2 style={{ margin: '0.25rem 0 0', fontSize: '1rem', fontWeight: 600, color: 'var(--color-on-surface)', fontFamily: 'var(--font-display)' }}>
              {dateStr}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-outline-variant)',
              borderRadius: '0.5rem', padding: '0.375rem 0.625rem', color: 'var(--color-on-surface)',
              cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Events Liste */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {sortedEvents.length === 0 ? (
            <p style={{ color: 'var(--color-outline)', fontSize: '0.875rem', textAlign: 'center', marginTop: '2rem' }}>
              Keine Termine an diesem Tag.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {sortedEvents.map(evt => {
                const color = calendarColor(calendars, evt.calendar_id, evt.calendar_name);
                const timeStr = evt.is_all_day ? 'Ganztägig' : `${toLocalTimeStr(evt.start_at)} – ${toLocalTimeStr(evt.end_at)}`;
                const isDeleting = deleting === evt.apple_uid;

                return (
                  <div
                    key={evt.apple_uid || evt.id}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                      padding: '0.75rem', borderRadius: '0.5rem',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                  >
                    {/* Farbpunkt */}
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: color, flexShrink: 0, marginTop: 3,
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>
                        {evt.title}
                      </p>
                      <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--color-outline)' }}>
                        {timeStr}
                      </p>
                      {evt.location && (
                        <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--color-outline)' }}>
                          {evt.location}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(evt)}
                      disabled={isDeleting}
                      title="Termin löschen"
                      style={{
                        background: 'none', border: 'none', cursor: isDeleting ? 'not-allowed' : 'pointer',
                        color: 'var(--color-outline)', fontSize: '0.8rem', padding: '0.25rem',
                        opacity: isDeleting ? 0.5 : 1, flexShrink: 0,
                      }}
                    >
                      🗑
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Neuer Termin Form */}
          {showForm && (
            <div style={{
              marginTop: '1.5rem', padding: '1.25rem', borderRadius: '0.75rem',
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-outline-variant)',
            }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
                Neuer Termin
              </h3>
              <EventForm
                calendars={calendars}
                initialDate={isoDateLocal(date)}
                onSaved={(evt) => { onEventCreated(evt); setShowForm(false); }}
                onClose={() => setShowForm(false)}
              />
            </div>
          )}
        </div>

        {/* Footer: Neuer Termin Button */}
        {!showForm && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-outline-variant)', flexShrink: 0 }}>
            <button
              onClick={() => setShowForm(true)}
              style={{
                width: '100%', padding: '0.75rem 1rem', borderRadius: '0.5rem',
                background: 'var(--color-primary)', color: 'var(--color-on-primary)',
                border: 'none', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              + Neuer Termin
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

// ── CalendarPage ───────────────────────────────────────────────────────────────

export function CalendarPage() {
  const today = new Date();
  const [year, setYear]   = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [viewDate, setViewDate] = useState<Date>(new Date());

  const [events, setEvents]       = useState<CalendarEvent[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Kalender einmalig laden
  useEffect(() => {
    fetchCalendars()
      .then(setCalendars)
      .catch(err => console.error('[CalendarPage] fetchCalendars failed:', err));
  }, []);

  // Sichtbare Kalender-IDs als Set
  const visibleCalendarIds = new Set(
    calendars.filter(c => c.is_visible === 1).map(c => c.id)
  );

  // Gefilterte Events (nur sichtbare Kalender)
  const filteredEvents = events.filter(evt =>
    !evt.calendar_id || visibleCalendarIds.has(evt.calendar_id)
  );

  // Kalender toggle (optimistisch)
  async function handleToggleCalendar(calId: string) {
    const cal = calendars.find(c => c.id === calId);
    if (!cal) return;
    const newVisible = cal.is_visible === 1 ? false : true;
    setCalendars(prev => prev.map(c => c.id === calId ? { ...c, is_visible: newVisible ? 1 : 0 } : c));
    try {
      await updateCalendarVisibility(calId, newVisible);
    } catch {
      // Rollback bei Fehler
      setCalendars(prev => prev.map(c => c.id === calId ? { ...c, is_visible: cal.is_visible } : c));
    }
  }

  // Events laden
  const loadEvents = useCallback(async (y: number, m: number) => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = monthRange(y, m);
      const data = await fetchEvents(from, to);
      setEvents(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden der Termine');
    } finally {
      setLoading(false);
    }
  }, []);

  // viewDate als stabiler String fuer useEffect-Dependency
  const viewDateStr = isoDateLocal(viewDate);

  useEffect(() => {
    if (viewMode === 'month') {
      loadEvents(year, month);
    } else if (viewMode === 'week') {
      const monday = new Date(viewDate);
      monday.setDate(viewDate.getDate() - ((viewDate.getDay() + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      setLoading(true);
      setError(null);
      fetchEvents(isoDateLocal(monday), isoDateLocal(sunday))
        .then(setEvents)
        .catch(err => setError(err instanceof Error ? err.message : 'Fehler beim Laden'))
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      setError(null);
      fetchEvents(viewDateStr, viewDateStr)
        .then(setEvents)
        .catch(err => setError(err instanceof Error ? err.message : 'Fehler beim Laden'))
        .finally(() => setLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, year, month, viewDateStr, loadEvents]);

  // Monat navigieren
  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null);
  }

  // Woche navigieren
  function prevWeek() { setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; }); }
  function nextWeek() { setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; }); }

  // Tag navigieren
  function prevDay() { setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; }); }
  function nextDay() { setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; }); }

  function goToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    setViewDate(new Date());
    setSelectedDate(null);
  }

  // Navigation abhaengig von viewMode
  const navPrev  = viewMode === 'month' ? prevMonth : viewMode === 'week' ? prevWeek : prevDay;
  const navNext  = viewMode === 'month' ? nextMonth : viewMode === 'week' ? nextWeek : nextDay;
  const navTitle = viewMode === 'month'
    ? `${MONTHS[month]} ${year}`
    : viewMode === 'week'
      ? weekRangeLabel(viewDate)
      : dayLabel(viewDate);

  const gridDays        = buildMonthGrid(year, month);
  const eventsByDate    = groupEventsByDate(filteredEvents);

  const selectedDateStr = selectedDate ? isoDateLocal(selectedDate) : null;
  const selectedEvents  = selectedDateStr ? (eventsByDate.get(selectedDateStr) ?? []) : [];

  function handleEventDeleted(appleUid: string) {
    setEvents(prev => prev.filter(e => e.apple_uid !== appleUid));
  }

  function handleEventCreated(evt: CalendarEvent) {
    setEvents(prev => [...prev, evt].sort((a, b) => a.start_at.localeCompare(b.start_at)));
  }

  const [syncing, setSyncing] = useState(false);
  async function handleSync() {
    setSyncing(true);
    try {
      await forceSync();
      if (viewMode === 'month') {
        await loadEvents(year, month);
      } else if (viewMode === 'week') {
        const monday = new Date(viewDate);
        monday.setDate(viewDate.getDate() - ((viewDate.getDay() + 6) % 7));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const data = await fetchEvents(isoDateLocal(monday), isoDateLocal(sunday));
        setEvents(data);
      } else {
        const data = await fetchEvents(viewDateStr, viewDateStr);
        setEvents(data);
      }
    } catch (err) {
      console.error('Sync fehlgeschlagen:', err);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <PageWrapper>
      {/* Header: Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap',
      }}>
        <button
          onClick={navPrev}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem', padding: '0.5rem 0.875rem', color: 'var(--color-on-surface)',
            cursor: 'pointer', fontSize: '1rem',
          }}
        >
          ‹
        </button>

        <h2 style={{ margin: 0, flex: 1, textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: '1.25rem', fontWeight: 600 }}>
          {navTitle}
        </h2>

        <button
          onClick={navNext}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem', padding: '0.5rem 0.875rem', color: 'var(--color-on-surface)',
            cursor: 'pointer', fontSize: '1rem',
          }}
        >
          ›
        </button>

        <button
          onClick={goToday}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem', padding: '0.5rem 0.875rem', color: 'var(--color-on-surface)',
            cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '0.05em',
          }}
        >
          Heute
        </button>

        <button
          onClick={handleSync}
          disabled={syncing}
          title="Apple Calendar neu einlesen"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem', padding: '0.5rem 0.875rem', color: syncing ? 'var(--color-outline)' : 'var(--color-on-surface)',
            cursor: syncing ? 'default' : 'pointer', fontSize: '0.8rem',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>sync</span>
          {syncing ? 'Lädt…' : 'Sync'}
        </button>

        {/* View-Switcher: Segmented Control */}
        <div style={{
          display: 'flex', borderRadius: '0.5rem', overflow: 'hidden',
          border: '1px solid var(--color-outline-variant)',
        }}>
          {(['month', 'week', 'day'] as const).map((mode) => {
            const labels: Record<ViewMode, string> = { month: 'Monat', week: 'Woche', day: 'Tag' };
            const isActive = viewMode === mode;
            return (
              <button
                key={mode}
                onClick={() => {
                  setViewMode(mode);
                  if (mode === 'week' || mode === 'day') {
                    setViewDate(selectedDate ?? new Date(year, month, new Date().getDate()));
                  }
                }}
                style={{
                  padding: '0.375rem 0.75rem', border: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', fontFamily: 'var(--font-body)',
                  background: isActive ? 'var(--color-primary)' : 'rgba(255,255,255,0.04)',
                  color: isActive ? 'var(--color-on-primary)' : 'var(--color-on-surface)',
                  transition: 'all 0.15s',
                }}
              >
                {labels[mode]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Fehler */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '0.5rem', marginBottom: '1rem',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: 'var(--color-error)', fontSize: '0.875rem',
        }}>
          {error}
        </div>
      )}

      {/* Kalender-Toggle-Chips */}
      {calendars.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem',
        }}>
          {calendars.map(cal => {
            const active = cal.is_visible === 1;
            return (
              <button
                key={cal.id}
                onClick={() => handleToggleCalendar(cal.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.375rem 0.75rem', borderRadius: '999px',
                  border: '1px solid var(--color-outline-variant)',
                  background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                  color: active ? 'var(--color-on-surface)' : 'var(--color-outline)',
                  cursor: 'pointer', fontSize: '0.8rem',
                  opacity: active ? 1 : 0.5,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: active ? (cal.color ?? 'var(--color-primary)') : 'var(--color-outline)',
                  flexShrink: 0,
                }} />
                {cal.title}
              </button>
            );
          })}
        </div>
      )}

      {/* Ansichten */}
      {viewMode === 'month' && (
        <>
          {/* Monats-Grid */}
          <div style={{
            background: 'var(--color-surface-container)', borderRadius: '0.75rem',
            border: '1px solid var(--color-outline-variant)', overflow: 'hidden',
          }}>
            {/* Wochentags-Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {WEEKDAYS.map(wd => (
                <div
                  key={wd}
                  style={{
                    padding: '0.75rem 0.5rem', textAlign: 'center',
                    fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase',
                    color: 'var(--color-outline)', borderBottom: '1px solid var(--color-outline-variant)',
                    fontWeight: 600,
                  }}
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Tage-Grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              opacity: loading ? 0.6 : 1, transition: 'opacity 0.2s',
            }}>
              {gridDays.map((day, idx) => {
                const dayKey       = isoDateLocal(day);
                const inMonth      = day.getMonth() === month;
                const isToday      = dayKey === isoDateLocal(today);
                const isSelected   = selectedDateStr === dayKey;
                const dayEvents    = eventsByDate.get(dayKey) ?? [];
                const showEvts     = dayEvents.slice(0, 3);
                const extraCount   = dayEvents.length - 3;
                const isWeekend    = idx % 7 >= 5;

                return (
                  <div
                    key={dayKey + '-' + idx}
                    onClick={() => setSelectedDate(day)}
                    style={{
                      minHeight: 100, minWidth: 0, padding: '0.5rem 0.5rem 0.375rem', overflow: 'hidden',
                      cursor: 'pointer',
                      borderBottom: idx < 35 ? '1px solid var(--color-outline-variant)' : 'none',
                      borderRight: idx % 7 < 6 ? '1px solid var(--color-outline-variant)' : 'none',
                      background: isSelected
                        ? 'rgba(var(--color-primary-rgb, 99, 102, 241), 0.12)'
                        : isWeekend && inMonth
                          ? 'rgba(255,255,255,0.015)'
                          : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background =
                        isWeekend && inMonth ? 'rgba(255,255,255,0.015)' : 'transparent';
                    }}
                  >
                    {/* Tagesnummer */}
                    <div style={{
                      display: 'flex', justifyContent: 'center', marginBottom: '0.375rem',
                    }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 26, height: 26, borderRadius: '50%',
                        fontSize: '0.8rem', fontWeight: isToday ? 700 : 400,
                        color: !inMonth
                          ? 'var(--color-outline)'
                          : isToday
                            ? 'var(--color-on-primary)'
                            : 'var(--color-on-surface)',
                        background: isToday ? 'var(--color-primary)' : 'transparent',
                        border: isSelected && !isToday ? '2px solid var(--color-primary)' : 'none',
                      }}>
                        {day.getDate()}
                      </span>
                    </div>

                    {/* Event-Chips */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {showEvts.map(evt => {
                        const color = calendarColor(calendars, evt.calendar_id, evt.calendar_name);
                        return (
                          <div
                            key={evt.apple_uid || evt.id}
                            style={{
                              fontSize: '0.65rem', padding: '1px 4px',
                              borderRadius: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                              borderLeft: `3px solid ${color}`,
                              background: `${color}22`,
                              color: inMonth ? 'var(--color-on-surface)' : 'var(--color-outline)',
                            }}
                            title={evt.title}
                          >
                            {evt.is_all_day ? '' : `${toLocalTimeStr(evt.start_at)} `}{evt.title}
                          </div>
                        );
                      })}
                      {extraCount > 0 && (
                        <div style={{ fontSize: '0.6rem', color: 'var(--color-outline)', paddingLeft: 4 }}>
                          +{extraCount} weitere
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tag-Detail SlideOver (nur in Monatsansicht) */}
          {selectedDate && (
            <DaySlideOver
              date={selectedDate}
              events={selectedEvents}
              calendars={calendars}
              onClose={() => setSelectedDate(null)}
              onEventDeleted={handleEventDeleted}
              onEventCreated={handleEventCreated}
            />
          )}
        </>
      )}

      {viewMode === 'week' && (
        <WeekView
          viewDate={viewDate}
          filteredEvents={filteredEvents}
          calendars={calendars}
          onDayClick={(d) => { setViewDate(d); setViewMode('day'); }}
        />
      )}

      {viewMode === 'day' && (
        <DayView
          viewDate={viewDate}
          filteredEvents={filteredEvents}
          calendars={calendars}
        />
      )}
    </PageWrapper>
  );
}

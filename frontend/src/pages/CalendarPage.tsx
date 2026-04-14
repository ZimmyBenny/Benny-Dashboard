import { useState, useEffect, useCallback, useRef } from 'react';
import { PageWrapper } from '../components/layout/PageWrapper';
import {
  fetchEvents, fetchCalendars, createEvent, updateEvent, deleteEvent, forceSync, updateCalendarVisibility,
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
  onNewEvent: (date: string) => void;
  onEventClick: (evt: CalendarEvent) => void;
}

function WeekView({ viewDate, filteredEvents, calendars, onNewEvent, onEventClick }: WeekViewProps) {
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
      {/* Wochentags-Header mit Datum + "+" Button */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
        {weekDays.map((day, i) => {
          const dayStr = isoDateLocal(day);
          const isToday = dayStr === todayStr;
          return (
            <div key={i} style={{
              padding: '0.5rem 0.375rem 0.5rem', textAlign: 'center',
              borderBottom: '1px solid var(--color-outline-variant)',
              borderRight: i < 6 ? '1px solid var(--color-outline-variant)' : 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem',
            }}>
              <div style={{ fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-outline)', fontWeight: 600 }}>
                {WEEKDAYS[i]}
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: '50%',
                fontSize: '0.9rem', fontWeight: isToday ? 700 : 400,
                color: isToday ? 'var(--color-on-primary)' : 'var(--color-on-surface)',
                background: isToday ? 'var(--color-primary)' : 'transparent',
              }}>
                {day.getDate()}
              </div>
              <button
                onClick={() => onNewEvent(dayStr)}
                title="Neuer Termin"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--color-outline-variant)',
                  cursor: 'pointer', padding: '3px 8px',
                  borderRadius: 6, color: 'var(--color-outline)',
                  fontSize: '0.7rem', letterSpacing: '0.04em',
                  lineHeight: 1.4, whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-primary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-outline)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-outline-variant)'; }}
              >+ Neu</button>
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
              style={{
                padding: '0.5rem 0.375rem',
                borderRight: i < 6 ? '1px solid var(--color-outline-variant)' : 'none',
                display: 'flex', flexDirection: 'column', gap: '4px',
              }}
            >
              {sorted.map(evt => {
                const color = calendarColor(calendars, evt.calendar_id, evt.calendar_name);
                return (
                  <div key={evt.apple_uid || evt.id}
                    onClick={() => onEventClick(evt)}
                    style={{
                      fontSize: '0.7rem', padding: '3px 5px', borderRadius: 4,
                      borderLeft: `3px solid ${color}`, background: `${color}22`,
                      color: 'var(--color-on-surface)', overflow: 'hidden',
                      whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      cursor: 'pointer',
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
  onNewEvent: (date: string) => void;
  onEventClick: (evt: CalendarEvent) => void;
}

function DayView({ viewDate, filteredEvents, calendars, onNewEvent, onEventClick }: DayViewProps) {
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
              <div key={evt.apple_uid || evt.id}
                onClick={() => onEventClick(evt)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.875rem 1.25rem', cursor: 'pointer',
                  borderBottom: idx < dayEvts.length - 1 ? '1px solid var(--color-outline-variant)' : 'none',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
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
      {/* Neuer Termin Button */}
      <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-outline-variant)' }}>
        <button
          onClick={() => onNewEvent(isoDateLocal(viewDate))}
          style={{
            width: '100%', padding: '0.625rem 1rem', borderRadius: '0.5rem',
            background: 'var(--color-primary)', color: 'var(--color-on-primary)',
            border: 'none', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Neuer Termin
        </button>
      </div>
    </div>
  );
}

// ── EventForm ──────────────────────────────────────────────────────────────────

const ALARM_PRESETS = [
  { label: 'Keine', value: null },
  { label: '5 Min vorher', value: 5 },
  { label: '15 Min vorher', value: 15 },
  { label: '30 Min vorher', value: 30 },
  { label: '1 Std vorher', value: 60 },
  { label: '1 Tag vorher', value: 1440 },
  { label: 'Eigene Zeit', value: -1 },
];

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

  function handleStartTimeChange(val: string) {
    setStartTime(val);
    // Endzeit auf Startzeit + 1h setzen, sofern Endzeit <= Startzeit
    const [sh, sm] = val.split(':').map(Number);
    const endMins = sh * 60 + sm + 60;
    const eh = Math.floor(endMins / 60) % 24;
    const em = endMins % 60;
    const newEnd = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
    const [curEh, curEm] = endTime.split(':').map(Number);
    if (curEh * 60 + curEm <= sh * 60 + sm) setEndTime(newEnd);
  }
  const [isAllDay, setIsAllDay]   = useState(false);
  const [calId, setCalId]         = useState(calendars[0]?.id ?? '');
  const [location, setLocation]   = useState('');
  const [alarmPreset, setAlarmPreset] = useState<number | null>(null); // null=Keine, -1=Eigene
  const [alarmCustom, setAlarmCustom] = useState('');
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
        // Ganztägig: Mitternacht lokal → UTC
        start_at = new Date(`${date}T00:00:00`).toISOString();
        end_at   = new Date(`${date}T23:59:59`).toISOString();
      } else {
        // Lokale Uhrzeit → UTC (ohne Z = Browser interpretiert als lokale Zeit)
        start_at = new Date(`${date}T${startTime}:00`).toISOString();
        end_at   = new Date(`${date}T${endTime}:00`).toISOString();
      }

      const alarmMinutes = alarmPreset === -1
        ? (parseInt(alarmCustom) > 0 ? parseInt(alarmCustom) : undefined)
        : (alarmPreset ?? undefined);

      const payload: CreateEventPayload = {
        title: title.trim(),
        start_at,
        end_at,
        calendar_id: calId,
        is_all_day: isAllDay,
        location: location.trim() || undefined,
        alarm_minutes: alarmMinutes,
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
            <input type="time" style={inputStyle} value={startTime} onChange={e => handleStartTimeChange(e.target.value)} />
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

      <div>
        <label style={labelStyle}>Erinnerung</label>
        <select
          style={{ ...inputStyle, cursor: 'pointer' }}
          value={alarmPreset ?? 'null'}
          onChange={e => {
            const v = e.target.value;
            setAlarmPreset(v === 'null' ? null : parseInt(v));
          }}
        >
          {ALARM_PRESETS.map(p => (
            <option key={String(p.value)} value={String(p.value)}>{p.label}</option>
          ))}
        </select>
        {alarmPreset === -1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            <input
              type="number"
              min="1"
              style={{ ...inputStyle, width: '100px' }}
              value={alarmCustom}
              onChange={e => setAlarmCustom(e.target.value)}
              placeholder="z.B. 45"
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--color-outline)' }}>Minuten vorher</span>
          </div>
        )}
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
  onEventUpdated: (evt: CalendarEvent) => void;
}

function DaySlideOver({ date, events, calendars, onClose, onEventDeleted, onEventCreated, onEventUpdated }: DaySlideOverProps) {
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editTitle, setEditTitle]       = useState('');
  const [editDate, setEditDate]         = useState('');
  const [editStart, setEditStart]       = useState('');
  const [editEnd, setEditEnd]           = useState('');
  const [editAllDay, setEditAllDay]     = useState(false);
  const [editCalId, setEditCalId]       = useState('');
  const [editLocation, setEditLocation]       = useState('');
  const [editNotes, setEditNotes]             = useState('');
  const [editAlarmPreset, setEditAlarmPreset] = useState<number | null>(null);
  const [editAlarmCustom, setEditAlarmCustom] = useState('');
  const [saving, setSaving]                   = useState(false);
  const [editError, setEditError]             = useState<string | null>(null);

  function handleEditStartChange(val: string) {
    setEditStart(val);
    const [sh, sm] = val.split(':').map(Number);
    const endMins = sh * 60 + sm + 60;
    const eh = Math.floor(endMins / 60) % 24;
    const em = endMins % 60;
    const newEnd = `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`;
    const [curEh, curEm] = editEnd.split(':').map(Number);
    if (curEh * 60 + curEm <= sh * 60 + sm) setEditEnd(newEnd);
  }

  function startEditing(evt: CalendarEvent) {
    const start = new Date(evt.start_at);
    const end   = new Date(evt.end_at);
    setEditingEvent(evt);
    setEditTitle(evt.title);
    setEditDate(isoDateLocal(start));
    setEditStart(`${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`);
    setEditEnd(`${String(end.getHours()).padStart(2,'0')}:${String(end.getMinutes()).padStart(2,'0')}`);
    setEditAllDay(evt.is_all_day === 1);
    setEditCalId(evt.calendar_id ?? '');
    setEditLocation(evt.location ?? '');
    setEditNotes(evt.notes ?? '');
    setEditAlarmPreset(null);
    setEditAlarmCustom('');
    setEditError(null);
  }

  async function handleUpdate() {
    if (!editingEvent) return;
    if (!editTitle.trim()) { setEditError('Titel erforderlich'); return; }
    setSaving(true);
    setEditError(null);
    try {
      const start_at = editAllDay
        ? new Date(`${editDate}T00:00:00`).toISOString()
        : new Date(`${editDate}T${editStart}:00`).toISOString();
      const end_at = editAllDay
        ? new Date(`${editDate}T23:59:59`).toISOString()
        : new Date(`${editDate}T${editEnd}:00`).toISOString();

      const alarmMinutes = editAlarmPreset === -1
        ? (parseInt(editAlarmCustom) > 0 ? parseInt(editAlarmCustom) : undefined)
        : editAlarmPreset;

      const updated = await updateEvent(editingEvent.id, {
        title: editTitle.trim(),
        start_at,
        end_at,
        is_all_day: editAllDay,
        calendar_id: editCalId || undefined,
        location: editLocation.trim() || null,
        notes: editNotes.trim() || null,
        alarm_minutes: alarmMinutes ?? null,
      });
      onEventUpdated(updated);
      setEditingEvent(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  // Drag-State
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragRef.current) return;
      setPos({
        x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
      });
    }
    function onMouseUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, []);

  function onHeaderMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    const cx = pos?.x ?? window.innerWidth / 2 - 200;
    const cy = pos?.y ?? window.innerHeight / 2 - 240;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: cx, origY: cy };
    if (!pos) setPos({ x: cx, y: cy });
  }

  const weekdayIdx = (date.getDay() + 6) % 7;
  const dateStr = `${WEEKDAYS_LONG[weekdayIdx]}, ${date.getDate()}. ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

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

  const modalStyle: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, transform: 'none' }
    : { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 40 }} />

      {/* Floating Modal */}
      <div style={{
        ...modalStyle,
        width: 420, maxWidth: 'calc(100vw - 2rem)',
        maxHeight: '80vh',
        background: 'var(--color-surface-container-high)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '0.75rem',
        zIndex: 50, display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Header — drag handle */}
        <div
          onMouseDown={onHeaderMouseDown}
          style={{
            padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-outline-variant)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0, cursor: 'grab', userSelect: 'none',
          }}
        >
          <div>
            <p style={{ margin: 0, fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-outline)' }}>
              Tagesansicht
            </p>
            <h2 style={{ margin: '0.2rem 0 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-on-surface)', fontFamily: 'var(--font-display)' }}>
              {dateStr}
            </h2>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem', padding: '0.3rem 0.6rem', color: 'var(--color-on-surface)',
            cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Events Liste */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
          {sortedEvents.length === 0 ? (
            <p style={{ color: 'var(--color-outline)', fontSize: '0.875rem', textAlign: 'center', marginTop: '1.5rem' }}>
              Keine Termine an diesem Tag.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {sortedEvents.map(evt => {
                const color = calendarColor(calendars, evt.calendar_id, evt.calendar_name);
                const timeStr = evt.is_all_day ? 'Ganztägig' : `${toLocalTimeStr(evt.start_at)} – ${toLocalTimeStr(evt.end_at)}`;
                const isDeleting = deleting === evt.apple_uid;
                const isEditing  = editingEvent?.apple_uid === evt.apple_uid;

                if (isEditing) {
                  return (
                    <div key={evt.apple_uid || evt.id} style={{
                      padding: '0.75rem', borderRadius: '0.5rem',
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid var(--color-primary)',
                      display: 'flex', flexDirection: 'column', gap: '0.625rem',
                    }}>
                      <p style={{ margin: 0, fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-primary)' }}>Termin bearbeiten</p>

                      <input style={inputStyle} value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Titel" autoFocus />

                      <input type="date" style={inputStyle} value={editDate} onChange={e => setEditDate(e.target.value)} />

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox" id={`allday-${evt.id}`} checked={editAllDay} onChange={e => setEditAllDay(e.target.checked)}
                          style={{ accentColor: 'var(--color-primary)', width: 14, height: 14 }} />
                        <label htmlFor={`allday-${evt.id}`} style={{ fontSize: '0.78rem', color: 'var(--color-outline)', cursor: 'pointer' }}>Ganztägig</label>
                      </div>

                      {!editAllDay && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                          <input type="time" style={inputStyle} value={editStart} onChange={e => handleEditStartChange(e.target.value)} />
                          <input type="time" style={inputStyle} value={editEnd}   onChange={e => setEditEnd(e.target.value)} />
                        </div>
                      )}

                      <select style={{ ...inputStyle, cursor: 'pointer' }} value={editCalId} onChange={e => setEditCalId(e.target.value)}>
                        {calendars.map(cal => <option key={cal.id} value={cal.id}>{cal.title}</option>)}
                      </select>

                      <input style={inputStyle} value={editLocation} onChange={e => setEditLocation(e.target.value)} placeholder="Ort (optional)" />

                      <select
                        style={{ ...inputStyle, cursor: 'pointer' }}
                        value={editAlarmPreset ?? 'null'}
                        onChange={e => { const v = e.target.value; setEditAlarmPreset(v === 'null' ? null : parseInt(v)); }}
                      >
                        {ALARM_PRESETS.map(p => (
                          <option key={String(p.value)} value={String(p.value)}>{p.label}</option>
                        ))}
                      </select>
                      {editAlarmPreset === -1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <input type="number" min="1" style={{ ...inputStyle, width: '80px' }}
                            value={editAlarmCustom} onChange={e => setEditAlarmCustom(e.target.value)} placeholder="z.B. 45" />
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-outline)' }}>Minuten vorher</span>
                        </div>
                      )}

                      {editError && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-error)' }}>{editError}</p>}

                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={handleUpdate} disabled={saving} style={{
                          flex: 1, padding: '0.5rem', borderRadius: '0.375rem',
                          background: 'var(--color-primary)', color: 'var(--color-on-primary)',
                          border: 'none', fontSize: '0.8rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                          opacity: saving ? 0.7 : 1,
                        }}>{saving ? 'Speichern…' : 'Speichern'}</button>
                        <button onClick={() => setEditingEvent(null)} style={{
                          flex: 1, padding: '0.5rem', borderRadius: '0.375rem',
                          background: 'rgba(255,255,255,0.06)', color: 'var(--color-on-surface)',
                          border: '1px solid var(--color-outline-variant)', fontSize: '0.8rem', cursor: 'pointer',
                        }}>Abbrechen</button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={evt.apple_uid || evt.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
                    padding: '0.625rem 0.75rem', borderRadius: '0.5rem',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--color-outline-variant)',
                  }}>
                    <div style={{ width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 4 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-on-surface)' }}>
                        {evt.title}
                      </p>
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.73rem', color: 'var(--color-outline)' }}>
                        {timeStr} · {evt.calendar_name}
                      </p>
                      {evt.location && (
                        <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--color-outline)' }}>
                          {evt.location}
                        </p>
                      )}
                    </div>
                    <button onClick={() => startEditing(evt)} title="Bearbeiten" style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--color-outline)', fontSize: '0.8rem', padding: '0.2rem', flexShrink: 0,
                    }}>✏️</button>
                    <button onClick={() => handleDelete(evt)} disabled={isDeleting} title="Löschen" style={{
                      background: 'none', border: 'none', cursor: isDeleting ? 'not-allowed' : 'pointer',
                      color: 'var(--color-outline)', fontSize: '0.8rem', padding: '0.2rem',
                      opacity: isDeleting ? 0.4 : 1, flexShrink: 0,
                    }}>🗑</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Neuer Termin Form */}
          {showForm && (
            <div style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: '0.625rem', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-outline-variant)' }}>
              <h3 style={{ margin: '0 0 0.875rem', fontSize: '0.85rem', fontWeight: 600 }}>Neuer Termin</h3>
              <EventForm
                calendars={calendars}
                initialDate={isoDateLocal(date)}
                onSaved={(evt) => { onEventCreated(evt); setShowForm(false); }}
                onClose={() => setShowForm(false)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        {!showForm && (
          <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--color-outline-variant)', flexShrink: 0 }}>
            <button onClick={() => setShowForm(true)} style={{
              width: '100%', padding: '0.625rem 1rem', borderRadius: '0.5rem',
              background: 'var(--color-primary)', color: 'var(--color-on-primary)',
              border: 'none', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
              fontWeight: 600, cursor: 'pointer',
            }}>
              + Neuer Termin
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── SyncNotificationPopup ──────────────────────────────────────────────────────

const SYNC_ACK_KEY = 'cal_last_ack_time';

function detectNewEvents(events: CalendarEvent[]): CalendarEvent[] {
  const lastAck = localStorage.getItem(SYNC_ACK_KEY);
  const cutoff = lastAck ? new Date(lastAck) : null;
  // Nur Events die innerhalb der letzten 2h ERSTMALS angelegt wurden
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  return events.filter(evt => {
    if (!evt.created_at) return false;
    const createdAt = new Date(evt.created_at);
    if (createdAt < twoHoursAgo) return false;           // zu alt
    if (cutoff && createdAt <= cutoff) return false;     // bereits bestätigt
    return true;
  });
}

interface SyncNotificationPopupProps {
  events: CalendarEvent[];
  onAck: () => void;
}

function SyncNotificationPopup({ events, onAck }: SyncNotificationPopupProps) {
  if (events.length === 0) return null;

  const preview = events.slice(0, 5);

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 60,
      width: 340, maxWidth: 'calc(100vw - 3rem)',
      background: 'var(--color-surface-container-high)',
      border: '1px solid var(--color-outline-variant)',
      borderRadius: '0.75rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.875rem 1rem', borderBottom: '1px solid var(--color-outline-variant)',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>sync</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
            {events.length} neue{events.length === 1 ? 'r Termin' : ' Termine'} synchronisiert
          </p>
          <p style={{ margin: '0.1rem 0 0', fontSize: '0.7rem', color: 'var(--color-outline)' }}>
            Aus Apple Kalender importiert
          </p>
        </div>
      </div>

      {/* Event-Liste */}
      <div style={{ padding: '0.625rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {preview.map(evt => (
          <div key={evt.apple_uid || evt.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-outline)', flexShrink: 0, minWidth: 80 }}>
              {new Date(evt.start_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
            </span>
            <span style={{
              fontSize: '0.8rem', color: 'var(--color-on-surface)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {evt.title}
            </span>
          </div>
        ))}
        {events.length > 5 && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--color-outline)' }}>
            … und {events.length - 5} weitere
          </p>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '0.625rem 1rem', borderTop: '1px solid var(--color-outline-variant)' }}>
        <button
          onClick={onAck}
          style={{
            width: '100%', padding: '0.5rem 1rem', borderRadius: '0.5rem',
            background: 'var(--color-primary)', color: 'var(--color-on-primary)',
            border: 'none', fontFamily: 'var(--font-body)', fontSize: '0.8rem',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Bestätigen
        </button>
      </div>
    </div>
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

  // Kalender-IDs die wir kennen (aus der calendars-Tabelle)
  const knownCalendarIds = new Set(calendars.map(c => c.id));

  // Gefilterte Events: sichtbare Kalender + Erinnerungen (deren Kalender nicht in unserer Liste)
  const filteredEvents = events.filter(evt =>
    !evt.calendar_id
    || visibleCalendarIds.has(evt.calendar_id)
    || !knownCalendarIds.has(evt.calendar_id)  // Reminder-Listen etc. immer anzeigen
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
      setNewSyncedEvents(detectNewEvents(data));
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
        .then(data => { setEvents(data); setNewSyncedEvents(detectNewEvents(data)); })
        .catch(err => setError(err instanceof Error ? err.message : 'Fehler beim Laden'))
        .finally(() => setLoading(false));
    } else {
      setLoading(true);
      setError(null);
      fetchEvents(viewDateStr, viewDateStr)
        .then(data => { setEvents(data); setNewSyncedEvents(detectNewEvents(data)); })
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

  function handleEventUpdated(evt: CalendarEvent) {
    setEvents(prev => prev.map(e => e.apple_uid === evt.apple_uid ? evt : e));
  }

  // Neuer-Termin-Modal für Wochen- und Tages-Ansicht
  const [createFormDate, setCreateFormDate] = useState<string | null>(null);

  const [newSyncedEvents, setNewSyncedEvents] = useState<CalendarEvent[]>([]);

  function handleAck() {
    localStorage.setItem(SYNC_ACK_KEY, new Date().toISOString());
    setNewSyncedEvents([]);
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
        setNewSyncedEvents(detectNewEvents(data));
      } else {
        const data = await fetchEvents(viewDateStr, viewDateStr);
        setEvents(data);
        setNewSyncedEvents(detectNewEvents(data));
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

        </>
      )}

      {viewMode === 'week' && (
        <WeekView
          viewDate={viewDate}
          filteredEvents={filteredEvents}
          calendars={calendars}
          onNewEvent={(date) => setCreateFormDate(date)}
          onEventClick={(evt) => setSelectedDate(new Date(evt.start_at))}
        />
      )}

      {viewMode === 'day' && (
        <DayView
          viewDate={viewDate}
          filteredEvents={filteredEvents}
          calendars={calendars}
          onNewEvent={(date) => setCreateFormDate(date)}
          onEventClick={(evt) => setSelectedDate(new Date(evt.start_at))}
        />
      )}

      {/* Tag-Detail SlideOver — funktioniert in allen Ansichten */}
      {selectedDate && (
        <DaySlideOver
          date={selectedDate}
          events={selectedEvents}
          calendars={calendars}
          onClose={() => setSelectedDate(null)}
          onEventDeleted={handleEventDeleted}
          onEventCreated={handleEventCreated}
          onEventUpdated={handleEventUpdated}
        />
      )}

      {/* Neuer-Termin-Modal für Wochen/Tages-Ansicht */}
      {createFormDate && (
        <>
          <div
            onClick={() => setCreateFormDate(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 420, maxWidth: 'calc(100vw - 2rem)',
            background: 'var(--color-surface-container-high)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.75rem', padding: '1.5rem',
            zIndex: 50, boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 600 }}>
                Neuer Termin
              </h3>
              <button
                onClick={() => setCreateFormDate(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-outline)', fontSize: '1.1rem' }}
              >✕</button>
            </div>
            <EventForm
              calendars={calendars.filter(c => c.is_visible === 1)}
              initialDate={createFormDate}
              onSaved={(evt) => { handleEventCreated(evt); setCreateFormDate(null); }}
              onClose={() => setCreateFormDate(null)}
            />
          </div>
        </>
      )}

      {/* Sync-Benachrichtigung */}
      <SyncNotificationPopup events={newSyncedEvents} onAck={handleAck} />
    </PageWrapper>
  );
}

import axios from 'axios';

// ── Typen ──────────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: number;
  apple_uid: string;
  title: string;
  start_at: string;       // ISO 8601 UTC
  end_at: string;         // ISO 8601 UTC
  is_all_day: number;     // 0 | 1
  calendar_name: string;
  location: string | null;
  notes: string | null;
  apple_stamp: string | null;
  sync_status: 'synced' | 'pending_push' | 'pending_delete';
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnownCalendar {
  id: number;
  name: string;
  color: string | null;
  enabled: number;
  first_seen_at: string;
}

export interface SyncResult {
  ok: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

export interface CreateEventPayload {
  title: string;
  start_at: string;
  end_at: string;
  is_all_day?: number;
  calendar_name: string;
  location?: string;
  notes?: string;
}

// ── API-Funktionen ─────────────────────────────────────────────────────────────

export async function fetchEvents(start?: string, end?: string): Promise<CalendarEvent[]> {
  const params = start && end ? { start, end } : {};
  const res = await axios.get<CalendarEvent[]>('/api/calendar/events', { params });
  return res.data;
}

export async function triggerSync(): Promise<SyncResult> {
  const res = await axios.post<SyncResult>('/api/calendar/sync');
  return res.data;
}

export async function fetchCalendars(checkNew = false): Promise<{ known: KnownCalendar[]; new_calendars: string[] }> {
  const res = await axios.get('/api/calendar/calendars', { params: { check_new: checkNew } });
  return res.data;
}

export async function createEvent(payload: CreateEventPayload): Promise<CalendarEvent> {
  const res = await axios.post<{ ok: boolean; event: CalendarEvent }>('/api/calendar/events', payload);
  return res.data.event;
}

export async function updateEvent(id: number, payload: Partial<CreateEventPayload>): Promise<CalendarEvent> {
  const res = await axios.put<{ ok: boolean; event: CalendarEvent }>(`/api/calendar/events/${id}`, payload);
  return res.data.event;
}

export async function deleteEvent(id: number): Promise<void> {
  await axios.delete(`/api/calendar/events/${id}`);
}

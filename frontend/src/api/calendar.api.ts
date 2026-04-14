import apiClient from './client';

// ── Typen ──────────────────────────────────────────────────────────────────────

export interface Calendar {
  id: string;          // EKCalendar.calendarIdentifier
  title: string;
  color: string | null;
  is_visible: number;
}

export interface CalendarEvent {
  id: number;           // SQLite auto-increment ID
  apple_uid: string;    // EKEvent.eventIdentifier
  calendar_id: string | null;
  calendar_name: string;
  title: string;
  start_at: string;     // ISO 8601
  end_at: string;       // ISO 8601
  is_all_day: number;   // 0 | 1
  location: string | null;
  notes: string | null;
  last_synced_at: string | null;
  created_at: string | null;
}

export interface CreateEventPayload {
  title: string;
  start_at: string;     // ISO 8601
  end_at: string;       // ISO 8601
  calendar_id: string;  // EKCalendar.calendarIdentifier
  is_all_day?: boolean;
  location?: string;
  notes?: string;
  alarm_minutes?: number; // Minuten vor dem Event (z.B. 15 = 15 Min vorher)
}

// ── API-Funktionen ─────────────────────────────────────────────────────────────

export async function fetchCalendars(): Promise<Calendar[]> {
  const res = await apiClient.get<Calendar[]>('/calendar/calendars');
  return res.data;
}

export async function fetchEvents(from: string, to: string): Promise<CalendarEvent[]> {
  const res = await apiClient.get<CalendarEvent[]>('/calendar/events', { params: { from, to } });
  return res.data;
}

export async function createEvent(payload: CreateEventPayload): Promise<CalendarEvent> {
  const res = await apiClient.post<{ ok: boolean; event: CalendarEvent }>('/calendar/events', payload);
  return res.data.event;
}

export interface UpdateEventPayload {
  title?: string;
  start_at?: string;
  end_at?: string;
  calendar_id?: string;
  is_all_day?: boolean;
  location?: string | null;
  notes?: string | null;
  alarm_minutes?: number | null;
}

export async function updateEvent(id: number, payload: UpdateEventPayload): Promise<CalendarEvent> {
  const res = await apiClient.patch<{ ok: boolean; event: CalendarEvent }>(`/calendar/events/${id}`, payload);
  return res.data.event;
}

export async function deleteEvent(appleUid: string): Promise<void> {
  await apiClient.delete(`/calendar/events/${encodeURIComponent(appleUid)}`);
}

export async function forceSync(): Promise<void> {
  await apiClient.post('/calendar/sync', {});
}

export async function updateCalendarVisibility(id: string, isVisible: boolean): Promise<void> {
  await apiClient.patch(`/calendar/calendars/${encodeURIComponent(id)}`, { is_visible: isVisible });
}

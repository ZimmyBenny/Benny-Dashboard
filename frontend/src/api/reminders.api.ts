import apiClient from './client';

export interface AppleReminder {
  id: number;
  apple_uid: string;
  title: string;
  list_name: string | null;
  due_date: string | null;        // ISO date/datetime
  reminder_date: string | null;
  completed: number;
  notes: string | null;
  last_synced_at: string | null;
}

export const fetchReminders = () =>
  apiClient.get<AppleReminder[]>('/reminders').then((r) => r.data);

export const completeReminder = (uid: string) =>
  apiClient.post<{ ok: true }>(`/reminders/${encodeURIComponent(uid)}/complete`).then((r) => r.data);

export const triggerRemindersSync = () =>
  apiClient.post<{ ok: true }>('/reminders/sync').then((r) => r.data);

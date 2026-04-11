import apiClient from './client';

export interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'waiting' | 'done' | 'archived';
  area: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  tags: string | null;
  project_or_customer: string | null;
  notes: string | null;
  start_date: string | null;
  reminder_at: string | null;
  has_reminder: number;
  create_calendar_entry: number;
  calendar_event_id: string | null;
  calendar_sync_status: string | null;
  is_all_day: number;
  estimated_duration: number | null;
  completed_at: string | null;
  position: number;
  status_note: string | null;
  source_page_id: number | null;
  source_page_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskStats {
  open_count: number;
  in_progress_count: number;
  waiting_count: number;
  done_this_week: number;
  overdue_count: number;
  due_this_week: number;
}

export type TaskCreateData = Omit<Task, 'id' | 'created_at' | 'updated_at' | 'completed_at' | 'position'> & {
  position?: number;
};

export type TaskUpdateData = Partial<Omit<Task, 'id' | 'created_at' | 'updated_at'>>;

export const fetchTasks = (filters?: {
  status?: string;
  area?: string;
  search?: string;
  priority?: string;
  all_done?: boolean;
}) =>
  apiClient.get<Task[]>('/tasks', { params: filters }).then((r) => r.data);

export const fetchTaskStats = () =>
  apiClient.get<TaskStats>('/tasks/stats').then((r) => r.data);

export const fetchDueReminders = () =>
  apiClient.get<Task[]>('/tasks/due-reminders').then((r) => r.data);

export const createTask = (data: Partial<Task> & { title: string }) =>
  apiClient.post<Task>('/tasks', data).then((r) => r.data);

export const updateTask = (id: number, data: TaskUpdateData) =>
  apiClient.put<Task>(`/tasks/${id}`, data).then((r) => r.data);

export const patchTaskStatus = (id: number, status: Task['status'], position: number, statusNote?: string | null) =>
  apiClient.patch<Task>(`/tasks/${id}/status`, { status, position, status_note: statusNote ?? null }).then((r) => r.data);

export const reorderTasks = (updates: { id: number; status: string; position: number; status_note?: string | null }[]) =>
  apiClient.patch('/tasks/reorder', { updates }).then((r) => r.data);

export const deleteTask = (id: number) =>
  apiClient.delete(`/tasks/${id}`).then((r) => r.data);

export const archiveTask = (id: number) =>
  apiClient.patch<Task>(`/tasks/${id}/status`, { status: 'archived', position: 0 }).then((r) => r.data);

export const fetchArchivedTasks = (search?: string) =>
  apiClient.get<Task[]>('/tasks', { params: { status: 'archived', ...(search ? { search } : {}) } }).then((r) => r.data);

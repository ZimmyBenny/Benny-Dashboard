import apiClient from './client';

export interface Client {
  id: number;
  name: string;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  client_id: number | null;
  client_name?: string;
  hourly_rate: number | null;
  color: string | null;
  created_at: string;
}

export interface TimeEntry {
  id: number;
  project_id: number | null;
  client_id: number | null;
  contact_id: number | null;
  project_name?: string;
  client_name?: string;
  contact_name?: string;
  title: string;
  note: string | null;
  date: string;
  duration_seconds: number;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
}

// Clients
export const fetchClients = () =>
  apiClient.get<Client[]>('/clients').then((r) => r.data);

export const createClient = (name: string) =>
  apiClient.post<Client>('/clients', { name }).then((r) => r.data);

// Projects
export const fetchProjects = () =>
  apiClient.get<Project[]>('/projects').then((r) => r.data);

export const createProject = (data: { name: string; client_id?: number | null; hourly_rate?: number | null }) =>
  apiClient.post<Project>('/projects', data).then((r) => r.data);

// Time entries
export const fetchTimeEntries = (filters?: {
  project_id?: number;
  client_id?: number;
  date_from?: string;
  date_to?: string;
}) =>
  apiClient.get<TimeEntry[]>('/time-entries', { params: filters }).then((r) => r.data);

export const createTimeEntry = (data: Omit<TimeEntry, 'id' | 'created_at' | 'project_name' | 'client_name'>) =>
  apiClient.post<TimeEntry>('/time-entries', data).then((r) => r.data);

export const updateTimeEntry = (id: number, data: Partial<Omit<TimeEntry, 'id' | 'created_at' | 'project_name' | 'client_name'>>) =>
  apiClient.put<TimeEntry>(`/time-entries/${id}`, data).then((r) => r.data);

export const deleteTimeEntry = (id: number) =>
  apiClient.delete(`/time-entries/${id}`).then((r) => r.data);

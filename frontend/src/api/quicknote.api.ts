import apiClient from './client';

// Schnelle Notiz — global, gespeichert im generischen app_settings-Key-Value-Store
// unter dem Key 'quick_note'. Kein eigenes Backend nötig.
const KEY = 'quick_note';

export async function getQuickNote(): Promise<string> {
  const r = await apiClient.get<Record<string, string>>('/app-settings');
  return r.data?.[KEY] ?? '';
}

export async function saveQuickNote(text: string): Promise<void> {
  await apiClient.put('/app-settings', { [KEY]: text });
}

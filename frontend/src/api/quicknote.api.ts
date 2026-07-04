import apiClient from './client';

// Schnelle Notiz — PRO Dashboard/Bereich getrennt, gespeichert im generischen
// app_settings-Key-Value-Store unter dem Key `quick_note_<scope>`.
// Kein eigenes Backend nötig.
const keyFor = (scope: string) => `quick_note_${scope}`;

export async function getQuickNote(scope: string): Promise<string> {
  const r = await apiClient.get<Record<string, string>>('/app-settings');
  return r.data?.[keyFor(scope)] ?? '';
}

export async function saveQuickNote(scope: string, text: string): Promise<void> {
  await apiClient.put('/app-settings', { [keyFor(scope)]: text });
}

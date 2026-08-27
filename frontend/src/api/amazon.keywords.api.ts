import apiClient from './client';

// ===== Amazon Keyword-Recherche (Migr. 134) =====

export interface KeywordSource {
  id: number; product_id: number; sort_order: number;
  asin: string; url: string; revenue: string;
  created_at: number; updated_at: number;
}
export type KeywordSourcePatch = Partial<{ asin: string; url: string; revenue: string }>;

// Erlaubte Ziel-Felder (leer = keine Zuordnung).
export type KeywordTargetField = '' | 'title' | 'bullet_1' | 'bullet_2' | 'bullet_3' | 'bullet_4' | 'bullet_5' | 'backend';

export interface Keyword {
  id: number; product_id: number; phrase: string;
  search_volume: number | null; source: string; is_main: number;
  target_field: KeywordTargetField; sort_order: number;
  coverage: number;        // wie viele Quellen-ASINs für dieses Keyword ranken (Migr. 135)
  coverage_total: number;  // Anzahl Quellen des Produkts gesamt -> Anzeige „coverage / total"
  created_at: number; updated_at: number;
}

// Eine geparste Import-Zeile (Client parst die Helium-10-Datei, schickt strukturiert).
export interface Helium10ImportRow { phrase: string; search_volume: number | null; asins: string[] }
export interface Helium10ImportResult { updated: number; added: number; linked: number; keywords: Keyword[] }
export type KeywordPatch = Partial<{
  phrase: string; search_volume: number | null; source: string;
  is_main: 0 | 1; target_field: KeywordTargetField;
}>;

// ── Quellen ──
export async function fetchKeywordSources(productId: number): Promise<KeywordSource[]> {
  const r = await apiClient.get<{ sources: KeywordSource[] }>(`/amazon/products/${productId}/keyword-sources`);
  return r.data.sources;
}
export async function createKeywordSource(productId: number): Promise<KeywordSource> {
  const r = await apiClient.post<{ source: KeywordSource }>(`/amazon/products/${productId}/keyword-sources`, {});
  return r.data.source;
}
export async function importCompetitorsAsSources(productId: number): Promise<{ added: number; sources: KeywordSource[] }> {
  const r = await apiClient.post<{ added: number; sources: KeywordSource[] }>(`/amazon/products/${productId}/keyword-sources/import-competitors`, {});
  return r.data;
}
export async function updateKeywordSource(productId: number, sid: number, patch: KeywordSourcePatch): Promise<KeywordSource> {
  const r = await apiClient.patch<{ source: KeywordSource }>(`/amazon/products/${productId}/keyword-sources/${sid}`, patch);
  return r.data.source;
}
export async function deleteKeywordSource(productId: number, sid: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/keyword-sources/${sid}`);
}

// ── Keywords ──
export async function fetchKeywords(productId: number): Promise<Keyword[]> {
  const r = await apiClient.get<{ keywords: Keyword[] }>(`/amazon/products/${productId}/keywords`);
  return r.data.keywords;
}
export async function addKeyword(productId: number, phrase: string, source = ''): Promise<Keyword> {
  const r = await apiClient.post<{ keyword: Keyword }>(`/amazon/products/${productId}/keywords`, { phrase, source });
  return r.data.keyword;
}
export async function addKeywordsBulk(productId: number, text: string, source = ''): Promise<{ added: number; keywords: Keyword[] }> {
  const r = await apiClient.post<{ added: number; keywords: Keyword[] }>(`/amazon/products/${productId}/keywords/bulk`, { text, source });
  return r.data;
}
export async function updateKeyword(productId: number, kid: number, patch: KeywordPatch): Promise<Keyword> {
  const r = await apiClient.patch<{ keyword: Keyword }>(`/amazon/products/${productId}/keywords/${kid}`, patch);
  return r.data.keyword;
}
export async function deleteKeyword(productId: number, kid: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/keywords/${kid}`);
}
export async function deleteAllKeywords(productId: number): Promise<{ deleted: number }> {
  const r = await apiClient.delete<{ deleted: number }>(`/amazon/products/${productId}/keywords`);
  return r.data;
}
export async function importHelium10(
  productId: number, sourceLabel: string, minVolume: number, rows: Helium10ImportRow[],
): Promise<Helium10ImportResult> {
  const r = await apiClient.post<Helium10ImportResult>(
    `/amazon/products/${productId}/keywords/import`,
    { source_label: sourceLabel, min_volume: minVolume, rows },
  );
  return r.data;
}

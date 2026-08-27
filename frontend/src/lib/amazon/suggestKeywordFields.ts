import type { Keyword, KeywordTargetField, FieldAssignment } from '../../api/amazon.keywords.api';

// Verteilungs-Defaults (Spec): Titel 5, Bullets ~20 (Round-Robin über 5), Backend ~50.
const TITLE_COUNT = 5;
const BULLET_COUNT = 20;
const BACKEND_COUNT = 50;
const BULLETS: KeywordTargetField[] = ['bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5'];

// Gewichtete Priorität (nur zur Sortierung, nicht angezeigt):
// viel Volumen + viele rankende Konkurrenten + Konkurrenten weit vorne.
export function keywordPriority(k: Keyword, maxVolume: number): number {
  const volNorm = maxVolume > 0 ? (k.search_volume ?? 0) / maxVolume : 0;
  const covFrac = k.coverage_total > 0 ? k.coverage / k.coverage_total : 0;
  const rankScore = k.best_rank == null ? 0 : Math.max(0, (50 - Math.min(k.best_rank, 50)) / 50);
  return 0.5 * volNorm + 0.3 * covFrac + 0.2 * rankScore;
}

/**
 * Schlägt für ALLE Keywords ein Ziel-Feld vor (auch '' für die zurückgesetzten).
 * Kandidaten = Volumen>0 oder Abdeckung>0; nach Priorität sortiert; verteilt
 * Titel -> Bullets (Round-Robin) -> Backend -> ohne Feld.
 */
export function suggestFieldAssignments(keywords: Keyword[]): FieldAssignment[] {
  const candidates = keywords.filter(k => (k.search_volume ?? 0) > 0 || k.coverage > 0);
  const others = keywords.filter(k => !((k.search_volume ?? 0) > 0 || k.coverage > 0));

  const maxVolume = candidates.reduce((m, k) => Math.max(m, k.search_volume ?? 0), 0);
  const ranked = [...candidates].sort((a, b) => keywordPriority(b, maxVolume) - keywordPriority(a, maxVolume));

  const result: FieldAssignment[] = ranked.map((k, i) => {
    let tf: KeywordTargetField = '';
    if (i < TITLE_COUNT) tf = 'title';
    else if (i < TITLE_COUNT + BULLET_COUNT) tf = BULLETS[(i - TITLE_COUNT) % BULLETS.length];
    else if (i < TITLE_COUNT + BULLET_COUNT + BACKEND_COUNT) tf = 'backend';
    return { id: k.id, target_field: tf };
  });
  for (const k of others) result.push({ id: k.id, target_field: '' });
  return result;
}

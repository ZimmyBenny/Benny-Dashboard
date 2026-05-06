/**
 * OcrConfidenceBadge — visualisiert die OCR-Confidence eines Feldes
 * (Phase 04 Plan 09).
 *
 * Confidence-Mapping:
 *  - >= threshold (default 0.6): gruener Badge — automatisch uebernommen
 *  - <  threshold:                gelber Badge — "manuell prüfen"-Hinweis
 *  - null/undefined:              kein Badge (Feld wurde nicht von OCR gesetzt)
 *
 * Akzeptiert sowohl 0..1 Floats (interner Service-Wert) als auch 0..100
 * Prozent-Werte (kommt teilweise aus `receipt_ocr_results.overall_confidence`).
 * Die normalize-Heuristik `confidence > 1 ? /100 : confidence` deckt beide
 * Faelle ab, ohne dass der Aufrufer die Skala kennen muss.
 */
export interface OcrConfidenceBadgeProps {
  /** Confidence 0..1 oder 0..100 oder null/undefined. */
  confidence: number | null | undefined;
  /** Schwellenwert (default 0.6 — entspricht Setting `ocr_confidence_threshold`). */
  threshold?: number;
}

export function OcrConfidenceBadge({
  confidence,
  threshold = 0.6,
}: OcrConfidenceBadgeProps) {
  if (confidence === null || confidence === undefined) return null;
  // Normalisiere auf 0..1 (akzeptiert beide Skalen)
  const c = confidence > 1 ? confidence / 100 : confidence;
  const passed = c >= threshold;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '0.1rem 0.4rem',
        borderRadius: '999px',
        fontSize: '0.65rem',
        fontWeight: 600,
        marginLeft: '0.5rem',
        background: passed ? 'rgba(92,253,128,0.15)' : 'rgba(255,200,80,0.15)',
        color: passed ? 'var(--color-secondary)' : '#ffd166',
        border: `1px solid ${passed ? '#5cfd80' : '#ffd166'}40`,
      }}
    >
      {passed ? `${Math.round(c * 100)}%` : `${Math.round(c * 100)}% manuell prüfen`}
    </span>
  );
}

// frontend/src/components/finance/reviews/reviewStatus.ts
// Phase 5 — Status-Pipeline-Konstanten + UI-Config-Map
// Referenz: 05-UI-SPEC.md Section "Status-Farbpalette" + "Layout-Struktur"

import type { ReviewStatus } from '../../../api/reviews.api';

/** Pipeline-Stati (6) in Reihenfolge — Karten koennen via "Weiter"-Button linear vorruecken. */
export const PIPELINE: ReviewStatus[] = [
  'vorgemerkt',
  'bestellt',
  'erhalten',
  'bewertet',
  'geld_erhalten',
  'bereit_verkauf',
];

/** Terminal-Stati (4) — End-Outcomes, kein "Weiter"-Button. */
export const TERMINAL: ReviewStatus[] = [
  'behalten',
  'verkauft',
  'verschenkt',
  'entsorgt',
];

/** Alle 10 Stati in Spalten-Reihenfolge (D-07). */
export const ALL_STATUSES: ReviewStatus[] = [...PIPELINE, ...TERMINAL];

/**
 * Liefert den naechsten Pipeline-Status oder null.
 * null bei: 'bereit_verkauf' (Pipeline-Ende — User muss explizit Terminal-Status waehlen)
 * null bei: jedem Terminal-Status.
 */
export function nextPipelineStatus(s: ReviewStatus): ReviewStatus | null {
  const idx = PIPELINE.indexOf(s);
  if (idx === -1) return null;             // Terminal-Status
  if (idx >= PIPELINE.length - 1) return null; // 'bereit_verkauf' (letzter Pipeline-Step)
  return PIPELINE[idx + 1];
}

export interface StatusConfigEntry {
  label: string;
  icon: string;     // Material Symbols Outlined
  accent: string;   // volle Farbe (Text, Icon, Border)
  bg: string;       // rgba mit ~15% Opacity (Spalten-/Badge-Hintergrund)
  border: string;   // rgba mit ~40% Opacity (Badge-Border)
}

/**
 * STATUS_CONFIG — Map ueber alle 10 Stati. Record erzwingt TS-Vollstaendigkeit.
 * Farbwerte aus 05-UI-SPEC.md Tabelle "Status-Farbpalette".
 */
export const STATUS_CONFIG: Record<ReviewStatus, StatusConfigEntry> = {
  vorgemerkt:     { label: 'Vorgemerkt',          icon: 'bookmark',              accent: '#6d758c', bg: 'rgba(109,117,140,0.20)', border: 'rgba(109,117,140,0.40)' },
  bestellt:       { label: 'Bestellt',            icon: 'local_shipping',        accent: '#cc97ff', bg: 'rgba(204,151,255,0.15)', border: 'rgba(204,151,255,0.40)' },
  erhalten:       { label: 'Erhalten',            icon: 'inbox',                 accent: '#34b5fa', bg: 'rgba(52,181,250,0.15)',  border: 'rgba(52,181,250,0.40)' },
  bewertet:       { label: 'Bewertet',            icon: 'rate_review',           accent: '#a68cff', bg: 'rgba(166,140,255,0.15)', border: 'rgba(166,140,255,0.40)' },
  geld_erhalten:  { label: 'Geld erhalten',       icon: 'account_balance_wallet', accent: '#4ade80', bg: 'rgba(74,222,128,0.15)',  border: 'rgba(74,222,128,0.40)' },
  bereit_verkauf: { label: 'Bereit zu verkaufen', icon: 'sell',                  accent: '#5cfd80', bg: 'rgba(92,253,128,0.12)',  border: 'rgba(92,253,128,0.35)' },
  behalten:       { label: 'Behalten',            icon: 'home',                  accent: '#ffc457', bg: 'rgba(255,196,87,0.15)',  border: 'rgba(255,196,87,0.40)' },
  verkauft:       { label: 'Verkauft',            icon: 'paid',                  accent: '#4ade80', bg: 'rgba(74,222,128,0.20)',  border: 'rgba(74,222,128,0.45)' },
  verschenkt:     { label: 'Verschenkt',          icon: 'redeem',                accent: '#a3aac4', bg: 'rgba(163,170,196,0.12)', border: 'rgba(163,170,196,0.30)' },
  entsorgt:       { label: 'Entsorgt',            icon: 'delete',                accent: '#ff6e84', bg: 'rgba(255,110,132,0.12)', border: 'rgba(255,110,132,0.35)' },
};

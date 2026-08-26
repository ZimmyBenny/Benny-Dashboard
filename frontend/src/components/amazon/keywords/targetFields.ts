import type { KeywordTargetField } from '../../../api/amazon.keywords.api';

// Auswahl-Optionen für die Feld-Zuordnung (Dropdown) — Reihenfolge = Anzeige.
export const TARGET_FIELD_OPTIONS: { value: KeywordTargetField; label: string }[] = [
  { value: '', label: '— kein Feld' },
  { value: 'title', label: 'Titel' },
  { value: 'bullet_1', label: 'Bullet 1' },
  { value: 'bullet_2', label: 'Bullet 2' },
  { value: 'bullet_3', label: 'Bullet 3' },
  { value: 'bullet_4', label: 'Bullet 4' },
  { value: 'bullet_5', label: 'Bullet 5' },
  { value: 'backend', label: 'Backend' },
];

// Kurz-Label je Ziel-Feld (für Badges/Gruppen).
export const TARGET_FIELD_LABEL: Record<KeywordTargetField, string> = {
  '': 'ohne Zuordnung',
  title: 'Titel',
  bullet_1: 'Bullet 1',
  bullet_2: 'Bullet 2',
  bullet_3: 'Bullet 3',
  bullet_4: 'Bullet 4',
  bullet_5: 'Bullet 5',
  backend: 'Backend',
};

// Reihenfolge der Gruppen auf der Hauptseite (Feld-Zuordnung).
export const TARGET_FIELD_GROUPS: KeywordTargetField[] = [
  'title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5', 'backend', '',
];

export const KEYWORDS_ACCENT = '#2dd4bf'; // Teal — passt zur Blau/Grün-Palette, unterscheidbar von Mitbewerber/Listing

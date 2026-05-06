/**
 * Helper zur Sanitierung von Display-Strings zu ASCII-Filesystem-Slugs.
 * Verwendet vom Belege-Modul für Lieferanten-/Beleg-Dateinamen.
 */

const UMLAUT_MAP: Record<string, string> = {
  'ä': 'ae',
  'ö': 'oe',
  'ü': 'ue',
  'Ä': 'ae',
  'Ö': 'oe',
  'Ü': 'ue',
  'ß': 'ss',
};

/**
 * Sanitisiert einen Display-String zu einem ASCII-Filesystem-tauglichen Slug.
 *
 * Schritte:
 *  1. Umlaute → ae/oe/ue/ss
 *  2. lowercase
 *  3. Nicht-[a-z0-9] → '-'
 *  4. Mehrfach-'-' kollabiert
 *  5. Trim '-' an Enden
 *  6. Truncate auf maxLength
 */
export function sanitizeForFilename(input: string, maxLength = 40): string {
  return input
    .replace(/[äöüÄÖÜß]/g, (ch) => UMLAUT_MAP[ch] ?? ch)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
}

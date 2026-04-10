// exportCsv.ts — Zeiterfassung CSV-Export Utility
// Semikolon-getrennt (Excel/Numbers DE Standard), BOM fuer korrekte Erkennung

export interface ExportRow {
  date: string;                  // YYYY-MM-DD
  start_time: string | null;     // ISO-String oder null
  end_time: string | null;       // ISO-String oder null
  duration_seconds: number;
  project_name: string | null;
  client_name: string | null;
  title: string;
  note: string | null;
}

export interface ExportOptions {
  entries: ExportRow[];
  filename?: string;             // Default: "zeiterfassung-export"
}

function formatHHMM(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTimeFromISO(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function escapeCsvField(value: string): string {
  // Wenn das Feld Semikolon, Anführungszeichen oder Zeilenumbrüche enthält → in "" einschließen
  if (value.includes(';') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportCsv(options: ExportOptions): void {
  const { entries, filename = 'zeiterfassung-export' } = options;

  const header = [
    'Datum',
    'Startzeit',
    'Endzeit',
    'Dauer (hh:mm)',
    'Dezimalstunden',
    'Projekt',
    'Kunde',
    'Taetigkeit',
    'Notiz',
  ].join(';');

  const rows = entries.map((e) => [
    escapeCsvField(e.date),
    escapeCsvField(formatTimeFromISO(e.start_time)),
    escapeCsvField(formatTimeFromISO(e.end_time)),
    escapeCsvField(formatHHMM(e.duration_seconds)),
    escapeCsvField((e.duration_seconds / 3600).toFixed(2)),
    escapeCsvField(e.project_name ?? ''),
    escapeCsvField(e.client_name ?? ''),
    escapeCsvField(e.title),
    escapeCsvField(e.note ?? ''),
  ].join(';'));

  // Gesamtzeile
  const totalSeconds = entries.reduce((sum, e) => sum + e.duration_seconds, 0);
  const totalRow = [
    'Gesamt',
    '',
    '',
    escapeCsvField(formatHHMM(totalSeconds)),
    escapeCsvField((totalSeconds / 3600).toFixed(2)),
    '',
    '',
    '',
    '',
  ].join(';');

  // BOM + Header + Zeilen + Gesamtzeile
  const csv = '\uFEFF' + [header, ...rows, totalRow].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * SteuerCsvPreviewModal — Vorschau einer Steuerberater-CSV als Tabelle.
 *
 * Lädt die Export-Route (GET /api/belege/export/:type.csv?year=) READ-ONLY als
 * Text (BOM entfernt), parst den Semikolon-CSV quote-aware zu Zeilen/Zellen und
 * rendert sie als Tabelle — ohne Datei-Download. Ein „Herunterladen"-Button im
 * Modal speichert dieselbe CSV über den bestehenden Blob-Download.
 *
 * Verschiebbar über den bestehenden useDraggableModal-Hook (am Header greifen).
 * Backdrop OHNE onClick — Klick außerhalb schließt das Modal NICHT (Projekt-Regel:
 * freischwebende Modals nur per X/„Schließen" schließbar).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import { downloadSteuerCsv, fetchSteuerCsvText, type SteuerCsvType } from '../../api/belege.api';

const TYPE_LABEL: Record<SteuerCsvType, string> = {
  fahrten: 'Fahrten',
  abwesenheitspauschalen: 'Abwesenheitspauschalen',
  belege: 'Belege/Rechnungen',
};

/**
 * Quote-aware CSV-Parser (Semikolon-getrennt, deutsches Format).
 * Zeichenweise State-Machine: Newlines innerhalb gequoteter Felder bleiben Teil
 * des Feldes; `""` innerhalb eines Feldes wird zu einem `"`. `\r\n` zählt als
 * eine Zeilengrenze. Abschließende Leerzeile (durch finalen Newline) wird verworfen.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ';') {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      // \r\n als eine Grenze behandeln
      if (ch === '\r' && text[i + 1] === '\n') i += 2;
      else i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Letztes Feld/Zeile flushen, falls kein abschließender Newline vorhanden ist
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Abschließende komplett-leere Zeile (nur eine leere Zelle) verwerfen
  while (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === '') rows.pop();
    else break;
  }

  return rows;
}

/** Deutsche Betrags-Zelle ("1.234,56" / "-500,00") → number. Leer/ungültig → 0. */
function parseEuroCell(s: string | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** number → "7.250,00 €" (deutsches Format). */
function formatEuro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

interface Props {
  type: SteuerCsvType;
  year: number;
  onClose: () => void;
}

export function SteuerCsvPreviewModal({ type, year, onClose }: Props) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['steuer-csv-preview', type, year],
    queryFn: () => fetchSteuerCsvText(type, year),
  });

  const rows = useMemo(() => (data ? parseCsv(data) : []), [data]);
  const header = rows[0] ?? [];
  const bodyRows = rows.slice(1);
  const dataRows = Math.max(0, rows.length - 1);

  /** Summen je Vorschau — Belege getrennt nach Aus-/Eingangsrechnungen, sonst Gesamtsumme "Betrag (EUR)". */
  const summary = useMemo(() => {
    if (bodyRows.length === 0) return null;
    const idx = (name: string) => header.findIndex((h) => h.trim() === name);
    if (type === 'belege') {
      const typIdx = idx('Typ');
      const bruttoIdx = idx('Brutto (EUR)');
      let einnahmen = 0;
      let ausgaben = 0;
      for (const r of bodyRows) {
        const t = (r[typIdx] ?? '').trim().toLowerCase();
        const brutto = parseEuroCell(r[bruttoIdx]);
        if (t.startsWith('ausgangs')) einnahmen += brutto;
        else if (t.startsWith('eingangs')) ausgaben += brutto;
      }
      return { kind: 'belege' as const, einnahmen, ausgaben };
    }
    const betragIdx = idx('Betrag (EUR)');
    let total = 0;
    for (const r of bodyRows) total += parseEuroCell(r[betragIdx]);
    return { kind: 'einzel' as const, total };
  }, [type, header, bodyRows]);

  async function handleDownload() {
    setDownloadBusy(true);
    setDownloadError(null);
    try {
      await downloadSteuerCsv(type, year);
    } catch (e) {
      setDownloadError((e as Error).message ?? 'Download fehlgeschlagen');
    } finally {
      setDownloadBusy(false);
    }
  }

  return (
    <>
      {/* Backdrop — kein onClick: Klick außerhalb schließt Modal nicht */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1200 }} />

      <div
        data-draggable-modal
        style={{
          position: 'fixed',
          zIndex: 1201,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(90vw, 900px)',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(6,14,32,0.99)',
          border: '1px solid rgba(148,170,255,0.3)',
          borderRadius: '1rem',
          boxShadow: '0 24px 72px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          ...modalStyle,
        }}
      >
        {/* Header (verschiebbar) */}
        <div
          onMouseDown={onMouseDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid rgba(148,170,255,0.15)',
            ...headerStyle,
          }}
        >
          <h2
            style={{
              fontFamily: 'Manrope, sans-serif',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: 'var(--color-on-surface)',
              margin: 0,
            }}
          >
            Vorschau · {TYPE_LABEL[type]} · {year}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-on-surface-variant)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              padding: '0.25rem',
            }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body (scrollbar) */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.25rem' }}>
          {isLoading ? (
            <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
              Lädt …
            </p>
          ) : isError ? (
            <p style={{ color: 'var(--color-error)', fontFamily: 'var(--font-body)' }}>
              Vorschau konnte nicht geladen werden.
            </p>
          ) : dataRows === 0 ? (
            <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
              Keine Daten für {year}.
            </p>
          ) : (
            <>
              <p
                style={{
                  color: 'var(--color-on-surface-variant)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.8rem',
                  margin: '0 0 0.75rem',
                }}
              >
                {dataRows} {dataRows === 1 ? 'Zeile' : 'Zeilen'}
              </p>
              {summary && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.875rem' }}>
                  {summary.kind === 'belege' ? (
                    <>
                      <SummaryChip
                        label="Einnahmen (Ausgangsrechnungen)"
                        value={formatEuro(summary.einnahmen)}
                        color="#5cfd80"
                      />
                      <SummaryChip
                        label="Ausgaben (Eingangsrechnungen)"
                        value={formatEuro(summary.ausgaben)}
                        color="var(--color-error)"
                      />
                    </>
                  ) : (
                    <SummaryChip label="Summe" value={formatEuro(summary.total)} color="var(--color-primary)" />
                  )}
                </div>
              )}
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: 'var(--font-body)',
                }}
              >
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {header.map((cell, ci) => (
                      <th
                        key={ci}
                        style={{
                          padding: '0.6rem 0.75rem',
                          textAlign: 'left',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: 'var(--color-on-surface-variant)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          whiteSpace: 'pre-wrap',
                          borderBottom: '1px solid rgba(148,170,255,0.15)',
                        }}
                      >
                        {cell}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((r, ri) => (
                    <tr key={ri} style={{ borderTop: '1px solid rgba(148,170,255,0.08)' }}>
                      {header.map((_, ci) => (
                        <td
                          key={ci}
                          style={{
                            padding: '0.5rem 0.75rem',
                            fontSize: '0.85rem',
                            color: 'var(--color-on-surface)',
                            fontFamily: 'var(--font-body)',
                            fontVariantNumeric: 'tabular-nums',
                            whiteSpace: 'pre-wrap',
                            verticalAlign: 'top',
                          }}
                        >
                          {r[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.625rem',
            padding: '0.875rem 1.25rem',
            borderTop: '1px solid rgba(148,170,255,0.15)',
          }}
        >
          {downloadError && (
            <span
              style={{
                color: 'var(--color-error)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem',
                marginRight: 'auto',
              }}
            >
              {downloadError}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(148,170,255,0.25)',
              borderRadius: '0.75rem',
              padding: '0.55rem 1.1rem',
              fontFamily: 'Manrope, sans-serif',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: 'var(--color-on-surface)',
              cursor: 'pointer',
            }}
          >
            Schließen
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadBusy}
            style={{
              background: downloadBusy
                ? 'rgba(148,170,255,0.4)'
                : 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
              color: '#060e20',
              border: 'none',
              borderRadius: '0.75rem',
              padding: '0.55rem 1.1rem',
              fontFamily: 'Manrope, sans-serif',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: downloadBusy ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              boxShadow: downloadBusy ? 'none' : '0 0 16px rgba(148,170,255,0.3)',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              download
            </span>
            {downloadBusy ? 'Lädt …' : 'Herunterladen'}
          </button>
        </div>
      </div>
    </>
  );
}

/** Kleine Summen-Kachel für die Vorschau (Label + Betrag). */
function SummaryChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.125rem',
        padding: '0.5rem 0.875rem',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(148,170,255,0.15)',
        borderRadius: '0.625rem',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.68rem',
          color: 'var(--color-on-surface-variant)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'Manrope, sans-serif',
          fontSize: '1.05rem',
          fontWeight: 700,
          color,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

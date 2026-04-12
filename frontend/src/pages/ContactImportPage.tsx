import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageWrapper } from '../components/layout/PageWrapper';
import { importCsv, type ContactImportResult } from '../api/contacts.api';

// ---------------------------------------------------------------------------
// CSV-Parsing clientseitig (nur fuer Preview)
// ---------------------------------------------------------------------------
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ';' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

interface PreviewRow {
  customerNumber: string;
  name: string;
  type: string;
  city: string;
  email: string;
}

function parsePreview(raw: string): { rows: PreviewRow[]; totalCount: number; duplicateHint: number } {
  let text = raw;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return { rows: [], totalCount: 0, duplicateHint: 0 };

  const headers = parseCsvLine(lines[0]);
  const col = (row: string[], name: string): string => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] ?? '').trim() : '';
  };

  const allRows = lines.slice(1).map(l => parseCsvLine(l));
  const totalCount = allRows.length;

  // Duplikate zaehlen (Kundennummern die mehrfach vorkommen im CSV, ohne Backend-Check)
  const seen = new Map<string, number>();
  for (const row of allRows) {
    const num = col(row, 'Kunden-Nr.');
    if (num) seen.set(num, (seen.get(num) ?? 0) + 1);
  }
  // Unique Kundennummern = unique Kontakte
  const uniqueNums = new Set(allRows.map(r => col(r, 'Kunden-Nr.')).filter(Boolean));
  const duplicateHint = 0; // echte Duplikate erst vom Backend bestimmt

  const preview: PreviewRow[] = [];
  const seenNums = new Set<string>();
  for (const row of allRows) {
    if (preview.length >= 10) break;
    const custNum = col(row, 'Kunden-Nr.');
    if (custNum && seenNums.has(custNum)) continue;
    if (custNum) seenNums.add(custNum);

    const org = col(row, 'Organisation');
    const first = col(row, 'Vorname');
    const last = col(row, 'Nachname');
    const name = (first || last) ? `${first} ${last}`.trim() : org || '—';

    preview.push({
      customerNumber: custNum || '—',
      name,
      type: col(row, 'Kategorie') || 'Kunde',
      city: col(row, 'Ort'),
      email: col(row, 'E-Mail'),
    });
  }

  return { rows: preview, totalCount: uniqueNums.size || totalCount, duplicateHint };
}

// ---------------------------------------------------------------------------
// ContactImportPage
// ---------------------------------------------------------------------------
export function ContactImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; totalCount: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ContactImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv') && f.type !== 'text/csv') {
      alert('Bitte nur CSV-Dateien hochladen.');
      return;
    }
    setFile(f);
    setResult(null);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setFileText(text);
      const { rows, totalCount } = parsePreview(text);
      setPreview({ rows, totalCount });
    };
    reader.readAsText(f, 'utf-8');
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await importCsv(file);
      setResult(res);
    } catch (err) {
      setImportError('Import fehlgeschlagen. Bitte Datei pruefen.');
      console.error(err);
    } finally {
      setImporting(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------
  const rowStyle: React.CSSProperties = {
    display: 'flex', gap: '0.875rem', padding: '0.625rem 0.875rem',
    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-outline-variant)',
    borderRadius: '0.375rem', alignItems: 'center', marginBottom: '0.375rem',
  };

  const headerRowStyle: React.CSSProperties = {
    ...rowStyle,
    background: 'transparent',
    borderColor: 'transparent',
    paddingBottom: '0.25rem',
  };

  const colStyle = (flex: number): React.CSSProperties => ({
    flex, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)',
  });

  const headerColStyle = (flex: number): React.CSSProperties => ({
    flex, fontFamily: 'var(--font-body)', fontSize: '0.7rem',
    letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-outline)',
  });

  return (
    <PageWrapper>
      {/* Zurueck */}
      <Link to="/contacts" style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
        color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)',
        fontSize: '0.85rem', textDecoration: 'none', marginBottom: '1.25rem',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>arrow_back</span>
        Zurueck zur Kontaktliste
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.75rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>upload_file</span>
        <h1 style={{
          fontFamily: 'var(--font-headline)', fontWeight: 800,
          fontSize: 'clamp(1.3rem, 3vw, 1.75rem)', letterSpacing: '-0.02em',
          color: 'var(--color-on-surface)', margin: 0,
        }}>
          CSV-Import (Sevdesk)
        </h1>
      </div>

      {/* Ergebnis nach Import */}
      {result && (
        <div style={{
          background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)',
          borderRadius: '0.5rem', padding: '1rem 1.25rem', marginBottom: '1.5rem',
        }}>
          <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, color: '#4ade80', marginBottom: '0.5rem', fontSize: '1rem' }}>
            Import abgeschlossen
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--color-on-surface)' }}>
              <strong style={{ color: '#4ade80' }}>{result.imported}</strong> importiert
            </span>
            <span style={{ color: 'var(--color-on-surface)' }}>
              <strong style={{ color: '#f472b6' }}>{result.skipped}</strong> uebersprungen
            </span>
            {result.errors.length > 0 && (
              <span style={{ color: '#f87171' }}>{result.errors.length} Fehler</span>
            )}
          </div>
          {result.errors.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              {result.errors.map((e, i) => (
                <div key={i} style={{ color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.775rem', marginBottom: '0.2rem' }}>• {e}</div>
              ))}
            </div>
          )}
          <button
            onClick={() => navigate('/contacts')}
            style={{
              marginTop: '0.875rem',
              background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
              border: 'none', borderRadius: '0.5rem', color: '#000',
              padding: '0.5rem 1.25rem', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 600,
            }}
          >
            Zur Kontaktliste
          </button>
        </div>
      )}

      {/* Upload-Bereich */}
      {!file && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--color-primary)' : 'var(--color-outline-variant)'}`,
            borderRadius: '0.75rem',
            padding: '3rem 2rem',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(204,151,255,0.04)' : 'rgba(255,255,255,0.02)',
            transition: 'border-color 150ms ease, background 150ms ease',
            marginBottom: '1.5rem',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--color-primary)', display: 'block', marginBottom: '0.75rem' }}>
            upload_file
          </span>
          <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)', marginBottom: '0.375rem' }}>
            CSV-Datei hierher ziehen oder klicken
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
            Sevdesk-Format, Semikolon-getrennt, UTF-8
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {/* Preview */}
      {file && preview && !result && (
        <div>
          {/* Datei-Info */}
          <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-outline-variant)',
            borderRadius: '0.5rem', padding: '0.875rem 1rem', marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.875rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>description</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-on-surface)' }}>
                {file.name}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.775rem', color: 'var(--color-on-surface-variant)' }}>
                {formatBytes(file.size)} · {preview.totalCount} Kontakte erkannt · Erkanntes Format: Sevdesk (Semikolon-getrennt)
              </div>
            </div>
            <button
              onClick={() => { setFile(null); setFileText(null); setPreview(null); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-on-surface-variant)', display: 'inline-flex',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>close</span>
            </button>
          </div>

          {/* Hinweis Sevdesk */}
          <div style={{
            background: 'rgba(96,165,250,0.07)', border: '1px solid rgba(96,165,250,0.2)',
            borderRadius: '0.375rem', padding: '0.625rem 0.875rem', marginBottom: '1rem',
            fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#60a5fa' }}>info</span>
            Kontakte mit bereits vorhandener Kundennummer werden uebersprungen.
          </div>

          {/* Preview-Tabelle */}
          {preview.rows.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-outline)', marginBottom: '0.5rem' }}>
                Vorschau (erste {preview.rows.length} Eintraege)
              </div>
              <div style={headerRowStyle}>
                <span style={headerColStyle(1)}>Kunden-Nr.</span>
                <span style={headerColStyle(3)}>Name / Organisation</span>
                <span style={headerColStyle(1.5)}>Typ</span>
                <span style={headerColStyle(1.5)}>Ort</span>
                <span style={headerColStyle(2)}>E-Mail</span>
              </div>
              {preview.rows.map((row, i) => (
                <div key={i} style={rowStyle}>
                  <span style={{ ...colStyle(1), fontFamily: 'monospace', fontSize: '0.775rem', color: 'var(--color-on-surface-variant)' }}>{row.customerNumber}</span>
                  <span style={{ ...colStyle(3), fontWeight: 600 }}>{row.name}</span>
                  <span style={{ ...colStyle(1.5), color: 'var(--color-on-surface-variant)' }}>{row.type}</span>
                  <span style={{ ...colStyle(1.5), color: 'var(--color-on-surface-variant)' }}>{row.city || '—'}</span>
                  <span style={{ ...colStyle(2), color: 'var(--color-on-surface-variant)' }}>{row.email || '—'}</span>
                </div>
              ))}
              {preview.totalCount > 10 && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.775rem', color: 'var(--color-on-surface-variant)', padding: '0.375rem 0' }}>
                  ... und {preview.totalCount - preview.rows.length} weitere Kontakte
                </div>
              )}
            </div>
          )}

          {/* Fehler */}
          {importError && (
            <div style={{
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)',
              borderRadius: '0.375rem', padding: '0.625rem 0.875rem', marginBottom: '1rem',
              color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
            }}>
              {importError}
            </div>
          )}

          {/* Import-Button */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={handleImport}
              disabled={importing}
              style={{
                background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
                border: 'none', borderRadius: '0.5rem', color: '#000',
                padding: '0.625rem 2rem', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                opacity: importing ? 0.7 : 1,
              }}
            >
              {importing ? (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', animation: 'spin 1s linear infinite' }}>sync</span>
                  Importiere...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>upload</span>
                  {preview.totalCount} Kontakte importieren
                </>
              )}
            </button>
            <button
              onClick={() => { setFile(null); setFileText(null); setPreview(null); }}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid var(--color-outline-variant)',
                borderRadius: '0.5rem', color: 'var(--color-on-surface)',
                padding: '0.625rem 1.25rem', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: '0.875rem',
              }}
            >
              Andere Datei waehlen
            </button>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}

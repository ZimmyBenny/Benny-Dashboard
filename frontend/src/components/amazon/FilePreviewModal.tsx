import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

export interface FilePreviewState { url: string; mime: string | null; name: string; }

export function useFilePreview() {
  const [preview, setPreview] = useState<FilePreviewState | null>(null);
  function open(url: string, mime: string | null, name: string) { setPreview({ url, mime, name }); }
  function close() { setPreview(prev => { if (prev) URL.revokeObjectURL(prev.url); return null; }); }
  return { preview, open, close };
}

// ---------------------------------------------------------------------------
// SpreadsheetPreview — Sub-Komponente für .xlsx / .xls / .csv
// ---------------------------------------------------------------------------

function SpreadsheetPreview({ url, name }: { url: string; name: string }) {
  const wbRef = useRef<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<number>(0);
  const [rows, setRows] = useState<any[][] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workbook laden (einmalig beim Mount bzw. URL-Wechsel)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows(null);
    setSheetNames([]);
    setActiveSheet(0);
    wbRef.current = null;

    (async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const buffer = await resp.arrayBuffer();
        if (cancelled) return;
        const wb = XLSX.read(buffer, { type: 'array' });
        wbRef.current = wb;
        if (cancelled) return;
        setSheetNames(wb.SheetNames);
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
        if (!cancelled) {
          setRows(data as any[][]);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError('Tabelle konnte nicht geladen werden.');
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [url]);

  // Aktives Blatt wechseln (ohne Re-Fetch)
  useEffect(() => {
    if (!wbRef.current || sheetNames.length === 0) return;
    const sheet = wbRef.current.Sheets[sheetNames[activeSheet]];
    if (!sheet) return;
    const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    setRows(data as any[][]);
  }, [activeSheet, sheetNames]);

  if (loading) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', padding: '2rem' }}>
        Wird geladen …
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3" style={{ color: '#fff' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48 }}>error_outline</span>
        <p className="text-sm">{error}</p>
        <a
          href={url}
          download={name}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
        >
          Herunterladen
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      {/* Reiter-Leiste — nur bei mehreren Blättern */}
      {sheetNames.length > 1 && (
        <div style={{ display: 'flex', gap: 4, padding: '0 0 6px 0', flexShrink: 0, flexWrap: 'wrap' }}>
          {sheetNames.map((sheetName, idx) => (
            <button
              key={sheetName}
              type="button"
              onClick={() => setActiveSheet(idx)}
              style={{
                padding: '4px 10px',
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                background: idx === activeSheet ? '#fff' : 'rgba(255,255,255,0.15)',
                color: idx === activeSheet ? '#111' : 'rgba(255,255,255,0.8)',
                fontWeight: idx === activeSheet ? 600 : 400,
              }}
            >
              {sheetName}
            </button>
          ))}
        </div>
      )}

      {/* Scrollbare Tabelle */}
      <div style={{ overflow: 'auto', flex: 1, minHeight: 0, background: '#fff', borderRadius: 4 }}>
        {rows && rows.length > 0 ? (
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>
            <thead>
              <tr>
                {(rows[0] as any[]).map((cell: any, ci: number) => (
                  <th
                    key={ci}
                    style={{
                      border: '1px solid #e0e0e0',
                      padding: '4px 6px',
                      background: '#f5f5f5',
                      fontWeight: 600,
                      color: '#222',
                      whiteSpace: 'nowrap',
                      textAlign: 'left',
                    }}
                  >
                    {String(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((row: any[], ri: number) => (
                <tr key={ri}>
                  {row.map((cell: any, ci: number) => (
                    <td
                      key={ci}
                      style={{
                        border: '1px solid #e0e0e0',
                        padding: '4px 6px',
                        color: '#333',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '1rem', color: '#888', fontSize: 13 }}>
            Keine Daten vorhanden.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilePreviewModal
// ---------------------------------------------------------------------------

export function FilePreviewModal({ preview, onClose }: { preview: FilePreviewState | null; onClose: () => void }) {
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [preview, onClose]);

  if (!preview) return null;

  const mime = preview.mime ?? '';
  const lowerName = preview.name.toLowerCase();

  const isImage = mime.startsWith('image/');
  const isPdf = mime === 'application/pdf';

  // isSpreadsheet VOR isText — damit .csv (MIME text/csv) als Tabelle landet
  const isSpreadsheet =
    /\.(xlsx|xls|csv)$/.test(lowerName) ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'text/csv';

  const isText = !isSpreadsheet && mime.startsWith('text/');

  // Header-Icon
  const headerIcon = isImage ? 'image' : isPdf ? 'picture_as_pdf' : isSpreadsheet ? 'table_chart' : 'description';

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.7)' }}>{headerIcon}</span>
        <span className="text-sm truncate flex-1" style={{ color: '#fff' }} title={preview.name}>{preview.name}</span>
        <a href={preview.url} download={preview.name} onClick={(e) => e.stopPropagation()} className="p-2 rounded-md" style={{ color: '#fff' }} title="Herunterladen">
          <span className="material-symbols-outlined">download</span>
        </a>
        <button type="button" onClick={onClose} className="p-2 rounded-md" style={{ color: '#fff' }} aria-label="Schließen">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {isImage ? (
          <img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
        ) : isSpreadsheet ? (
          <SpreadsheetPreview url={preview.url} name={preview.name} />
        ) : (isPdf || isText) ? (
          <iframe src={preview.url} title={preview.name} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        ) : (
          <div className="flex flex-col items-center gap-3" style={{ color: '#fff' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48 }}>draft</span>
            <p className="text-sm">Für diesen Dateityp ist keine Vorschau möglich.</p>
            <a href={preview.url} download={preview.name} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Herunterladen</a>
          </div>
        )}
      </div>
    </div>
  );
}

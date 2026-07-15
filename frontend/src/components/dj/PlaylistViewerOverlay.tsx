import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { fetchDocFileBlobUrl } from '../../api/documents.api';
import { playlistFileType, Playlist } from '../../api/dj.playlists.api';

interface PlaylistViewerOverlayProps {
  playlist: Playlist;
  onClose: () => void;
}

/**
 * Vollbild-Overlay fuer eine Playlist-Datei: PDF im iframe, HTML sandboxed
 * (keine Skripte — fremde Dateien!), Excel erstes Sheet als Tabelle.
 * ESC schliesst, Backdrop-Klick schliesst NICHT (Memory-Lesson).
 */
export function PlaylistViewerOverlay({ playlist, onClose }: PlaylistViewerOverlayProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const [rows, setRows] = useState<any[][] | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const type = playlistFileType(playlist.filename);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHtmlContent(null);
    setDocxHtml(null);
    setRows(null);

    (async () => {
      try {
        const url = await fetchDocFileBlobUrl(playlist.doc_file_id);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        blobUrlRef.current = url;
        setBlobUrl(url);

        if (type === 'HTML') {
          const text = await (await fetch(url)).text();
          if (!cancelled) setHtmlContent(text);
        } else if (type === 'Excel' || type === 'CSV') {
          const buffer = await (await fetch(url)).arrayBuffer();
          const wb = XLSX.read(buffer, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
          if (!cancelled) setRows(data as any[][]);
        } else if (type === 'Word') {
          const buffer = await (await fetch(url)).arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (!cancelled) setDocxHtml(result.value);
        }
        if (!cancelled) setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Datei konnte nicht geladen werden.');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.doc_file_id, type]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  function handleDownload() {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = playlist.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column' }}>
      {/* Kopf */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1.25rem',
        borderBottom: '1px solid rgba(255,255,255,0.1)', flexShrink: 0,
      }}>
        <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.7)' }}>
          {type === 'PDF' ? 'picture_as_pdf' : type === 'Excel' || type === 'CSV' ? 'table_chart' : type === 'HTML' ? 'html' : type === 'Word' ? 'description' : 'draft'}
        </span>
        <span style={{ color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.9375rem', flex: 1 }} title={playlist.title}>
          {playlist.title}
        </span>
        {playlist.category_name && (
          <span style={{
            background: 'rgba(148,170,255,0.2)', color: '#94aaff',
            borderRadius: '0.375rem', padding: '0.125rem 0.625rem',
            fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap',
          }}>{playlist.category_name}</span>
        )}
        <button
          onClick={handleDownload}
          disabled={!blobUrl}
          title="Herunterladen"
          style={{ background: 'none', border: 'none', cursor: blobUrl ? 'pointer' : 'not-allowed', color: '#fff', padding: '0.375rem', display: 'flex', opacity: blobUrl ? 1 : 0.4 }}
        >
          <span className="material-symbols-outlined">download</span>
        </button>
        <button
          onClick={onClose}
          title="Schließen"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: '0.375rem', display: 'flex' }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      {/* Inhalt */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        {loading ? (
          <p style={{ color: '#fff', fontFamily: 'var(--font-body)' }}>Wird geladen…</p>
        ) : error ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: '#fff' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '48px' }}>error_outline</span>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>{error}</p>
            {blobUrl && (
              <button onClick={handleDownload} style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', cursor: 'pointer' }}>
                Herunterladen
              </button>
            )}
          </div>
        ) : type === 'PDF' && blobUrl ? (
          <iframe src={blobUrl} title={playlist.title} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        ) : type === 'HTML' && htmlContent !== null ? (
          <iframe sandbox="" srcDoc={htmlContent} title={playlist.title} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        ) : type === 'Excel' || type === 'CSV' ? (
          rows && rows.length > 0 ? (
            <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#fff', borderRadius: '0.5rem' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '0.8125rem', minWidth: '100%' }}>
                <thead>
                  <tr>
                    {(rows[0] as any[]).map((cell, ci) => (
                      <th key={ci} style={{ border: '1px solid #e0e0e0', padding: '4px 8px', background: '#f5f5f5', fontWeight: 600, color: '#222', whiteSpace: 'nowrap', textAlign: 'left' }}>
                        {String(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(1).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ border: '1px solid #e0e0e0', padding: '4px 8px', color: '#333', whiteSpace: 'nowrap' }}>
                          {String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: '#fff', fontFamily: 'var(--font-body)' }}>Keine Daten in dieser Tabelle.</p>
          )
        ) : type === 'Word' && docxHtml !== null ? (
          <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#fff', borderRadius: '0.5rem' }}>
            <div
              style={{ maxWidth: '820px', margin: '0 auto', padding: '2.5rem 3rem', color: '#222', fontFamily: 'var(--font-body)', fontSize: '0.9375rem', lineHeight: 1.6 }}
              dangerouslySetInnerHTML={{ __html: docxHtml }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', color: '#fff' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '48px' }}>draft</span>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>Für diesen Dateityp ist keine Vorschau möglich.</p>
            {blobUrl && (
              <button onClick={handleDownload} style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: 'none', borderRadius: '0.5rem', padding: '0.5rem 1rem', fontFamily: 'var(--font-body)', fontSize: '0.875rem', cursor: 'pointer' }}>
                Herunterladen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

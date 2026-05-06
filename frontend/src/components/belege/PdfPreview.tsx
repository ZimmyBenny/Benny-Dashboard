/**
 * PdfPreview — Inline-PDF-/Bild-Vorschau fuer das Belege-Modul.
 *
 * Datei wird via apiClient (mit Auth-Header) als Blob geladen und
 * ueber Object-URL an <img> bzw. react-pdf <Document> uebergeben.
 * Hintergrund: react-pdf und <img> machen eigene fetch-Calls, die
 * NICHT durch den axios-Interceptor laufen — ohne Blob-Loading
 * antworten geschuetzte /api/belege/:id/file/:fileId-Endpoints mit 401.
 */
import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import apiClient from '../../api/client';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  url: string;
  mimeType: string | null;
  width?: number;
}

export function PdfPreview({ url, mimeType, width = 520 }: PdfPreviewProps) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // apiClient.baseURL = '/api' — strippen damit kein /api/api/... wird.
  const apiPath = useMemo(
    () => (url.startsWith('/api/') ? url.slice(4) : url),
    [url]
  );

  useEffect(() => {
    let cancelled = false;
    let createdObjectUrl: string | null = null;
    setLoadError(null);
    setBlobUrl(null);

    apiClient
      .get(apiPath, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(res.data as Blob);
        createdObjectUrl = objectUrl;
        setBlobUrl(objectUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        const msg = status
          ? `HTTP ${status} beim Laden der Datei`
          : err?.message ?? 'Datei konnte nicht geladen werden';
        setLoadError(msg);
      });

    return () => {
      cancelled = true;
      if (createdObjectUrl) URL.revokeObjectURL(createdObjectUrl);
    };
  }, [apiPath]);

  const isImage =
    mimeType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp)$/i.test(url);
  const isPdf =
    mimeType === 'application/pdf' || (!isImage && /\.pdf$/i.test(url));

  const frameStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    borderRadius: '0.75rem',
    padding: '0.75rem',
    border: '1px solid rgba(148,170,255,0.1)',
  };

  if (loadError) {
    return (
      <div style={frameStyle}>
        <div
          style={{
            padding: '1rem',
            color: 'var(--color-error)',
            fontSize: '0.85rem',
            fontFamily: 'var(--font-body)',
          }}
        >
          Datei konnte nicht geladen werden: {loadError}
        </div>
      </div>
    );
  }

  if (!blobUrl) {
    return (
      <div style={frameStyle}>
        <div
          style={{
            padding: '2rem',
            color: 'var(--color-on-surface-variant)',
            fontSize: '0.85rem',
            textAlign: 'center',
            fontFamily: 'var(--font-body)',
          }}
        >
          Lade Vorschau…
        </div>
      </div>
    );
  }

  if (isImage) {
    return (
      <div style={{ ...frameStyle, padding: '0.5rem' }}>
        <img
          src={blobUrl}
          alt="Beleg-Vorschau"
          style={{ display: 'block', maxWidth: '100%', borderRadius: '0.5rem' }}
        />
      </div>
    );
  }

  if (!isPdf) {
    return (
      <div style={{ ...frameStyle, padding: '1.5rem', textAlign: 'center' }}>
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '2rem',
            display: 'block',
            marginBottom: '0.5rem',
            opacity: 0.5,
            color: 'var(--color-on-surface-variant)',
          }}
        >
          description
        </span>
        <div
          style={{
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
          }}
        >
          Vorschau für diesen Dateityp nicht verfügbar.
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <a
            href={blobUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--color-primary)',
              textDecoration: 'underline',
              fontSize: '0.85rem',
            }}
          >
            Datei öffnen / herunterladen
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={frameStyle}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <Document
          file={blobUrl}
          onLoadSuccess={(pdf) => {
            setPageCount(pdf.numPages);
            setLoadError(null);
          }}
          onLoadError={(err) => {
            setLoadError(err.message);
          }}
          loading={
            <div
              style={{
                padding: '2rem',
                color: 'var(--color-on-surface-variant)',
                fontSize: '0.85rem',
              }}
            >
              Lade PDF…
            </div>
          }
        >
          <Page
            pageNumber={pageNum}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
      {pageCount && pageCount > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.75rem',
            marginTop: '0.75rem',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          <button
            type="button"
            onClick={() => setPageNum((n) => Math.max(1, n - 1))}
            disabled={pageNum <= 1}
            style={{
              background: 'rgba(148,170,255,0.1)',
              border: '1px solid rgba(148,170,255,0.2)',
              color: 'var(--color-on-surface)',
              padding: '0.25rem 0.75rem',
              borderRadius: '0.375rem',
              cursor: pageNum <= 1 ? 'not-allowed' : 'pointer',
              opacity: pageNum <= 1 ? 0.4 : 1,
            }}
          >
            ‹ zurück
          </button>
          <span>
            Seite {pageNum} / {pageCount}
          </span>
          <button
            type="button"
            onClick={() => setPageNum((n) => Math.min(pageCount, n + 1))}
            disabled={pageNum >= pageCount}
            style={{
              background: 'rgba(148,170,255,0.1)',
              border: '1px solid rgba(148,170,255,0.2)',
              color: 'var(--color-on-surface)',
              padding: '0.25rem 0.75rem',
              borderRadius: '0.375rem',
              cursor: pageNum >= pageCount ? 'not-allowed' : 'pointer',
              opacity: pageNum >= pageCount ? 0.4 : 1,
            }}
          >
            weiter ›
          </button>
        </div>
      )}
    </div>
  );
}

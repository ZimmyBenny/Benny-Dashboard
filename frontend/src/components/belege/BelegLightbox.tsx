/**
 * BelegLightbox — Belege-eigene Vollbild-Vorschau (Feature 2, Plan quick-260702-vz7).
 *
 * Basis: Auth-Blob-Lade-Logik aus `belege/PdfPreview.tsx` (apiClient mit
 * Auth-Header → Blob → Object-URL; react-pdf und <img> machen eigene fetch-
 * Calls, die NICHT durch den axios-Interceptor laufen — ohne Blob-Loading
 * antworten geschuetzte /api/belege/:id/file/:fileId-Endpoints mit 401).
 *
 * WICHTIG (Projektregel feedback_ux_patterns): Schliesst NUR per ✕-Button
 * oder Esc — Backdrop-Klick schliesst NICHT. Das DJ-eigene PdfPreviewModal
 * wird bewusst NICHT wiederverwendet (PDF-only, schliesst per Backdrop-Klick,
 * kein Auth-Blob-Loading — siehe Design-Spec).
 */
import { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import apiClient from '../../api/client';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface BelegLightboxProps {
  url: string;
  mimeType: string | null;
  onClose: () => void;
}

export function BelegLightbox({ url, mimeType, onClose }: BelegLightboxProps) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  // apiClient.baseURL = '/api' — strippen damit kein /api/api/... wird.
  const apiPath = useMemo(() => (url.startsWith('/api/') ? url.slice(4) : url), [url]);

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

  // Esc schliesst die Lightbox.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const isImage = mimeType?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(url);
  const isPdf = mimeType === 'application/pdf' || (!isImage && /\.pdf$/i.test(url));

  const pdfWidth = Math.min(window.innerWidth * 0.9, 900);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      {/* Schliessen — NUR dieser Button und Esc loesen onClose aus (Backdrop-Klick bewusst ohne onClick). */}
      <button
        type="button"
        onClick={onClose}
        title="Schließen (Esc)"
        style={{
          position: 'absolute',
          top: '1.25rem',
          right: '1.5rem',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '999px',
          width: '2.5rem',
          height: '2.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          cursor: 'pointer',
          zIndex: 1001,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.5rem' }}>close</span>
      </button>

      {loadError && (
        <div
          style={{
            color: 'var(--color-error)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            background: 'rgba(0,0,0,0.4)',
            padding: '1.5rem',
            borderRadius: '0.75rem',
          }}
        >
          Datei konnte nicht geladen werden: {loadError}
        </div>
      )}

      {!loadError && !blobUrl && (
        <div
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
          }}
        >
          Lade Vorschau…
        </div>
      )}

      {!loadError && blobUrl && isImage && (
        <div
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: zoomed ? 'auto' : 'hidden',
            display: 'flex',
            alignItems: zoomed ? 'flex-start' : 'center',
            justifyContent: zoomed ? 'flex-start' : 'center',
          }}
        >
          <img
            src={blobUrl}
            alt="Beleg-Vollbild"
            onClick={() => setZoomed((z) => !z)}
            title={zoomed ? 'Klick zum Verkleinern' : 'Klick zum Vergrößern'}
            style={{
              display: 'block',
              cursor: zoomed ? 'zoom-out' : 'zoom-in',
              maxWidth: zoomed ? 'none' : '90vw',
              maxHeight: zoomed ? 'none' : '90vh',
              width: zoomed ? '180%' : 'auto',
              objectFit: 'contain',
              borderRadius: '0.5rem',
            }}
          />
        </div>
      )}

      {!loadError && blobUrl && isPdf && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            maxHeight: '92vh',
            overflowY: 'auto',
          }}
        >
          <Document
            file={blobUrl}
            onLoadSuccess={(pdf) => {
              setPageCount(pdf.numPages);
              setLoadError(null);
            }}
            onLoadError={(err) => setLoadError(err.message)}
            loading={
              <div style={{ padding: '2rem', color: 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-body)' }}>
                Lade PDF…
              </div>
            }
          >
            <Page pageNumber={pageNum} width={pdfWidth} renderTextLayer={true} renderAnnotationLayer={false} />
          </Document>

          {pageCount && pageCount > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.75rem',
                marginTop: '1rem',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                color: '#fff',
              }}
            >
              <button
                type="button"
                onClick={() => setPageNum((n) => Math.max(1, n - 1))}
                disabled={pageNum <= 1}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  color: '#fff',
                  padding: '0.375rem 1rem',
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
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.25)',
                  color: '#fff',
                  padding: '0.375rem 1rem',
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
      )}

      {!loadError && blobUrl && !isImage && !isPdf && (
        <div
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.9rem',
            textAlign: 'center',
          }}
        >
          Vorschau für diesen Dateityp nicht verfügbar.
        </div>
      )}
    </div>
  );
}

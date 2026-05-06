/**
 * PdfPreview — Inline-PDF-/Bild-Vorschau fuer das Belege-Modul (Phase 04 Plan 08).
 *
 * Genutzt in BelegeDetailPage (linke Spalte des Split-Layouts).
 * - Bilder (image/*) werden als <img> gerendert.
 * - PDFs werden via react-pdf seitenweise gerendert (Worker via CDN).
 * - Sonstige Mime-Types: Hinweis "Vorschau nicht verfuegbar" + Download-Link.
 *
 * react-pdf-Worker wird via unpkg-CDN geladen (siehe Plan-Snippet);
 * fuer Single-User-Local-App ist das akzeptabel, alternative waere
 * lokales Copy ueber Vite-Plugin (defer-to-future).
 */
import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Worker via CDN — synchron mit installierter pdfjs-Version (vermeidet API-Drift).
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfPreviewProps {
  /** absolute URL oder /api-Pfad zur Datei (PDF oder Bild). */
  url: string;
  /** Mime-Type aus receipt_files; wenn null wird per Endung erkannt. */
  mimeType: string | null;
  /** Optionale Breite (px). Default 520. */
  width?: number;
}

export function PdfPreview({ url, mimeType, width = 520 }: PdfPreviewProps) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isImage =
    mimeType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp)$/i.test(url);
  const isPdf =
    mimeType === 'application/pdf' || (!isImage && /\.pdf$/i.test(url));

  if (isImage) {
    return (
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '0.75rem',
          padding: '0.5rem',
          border: '1px solid rgba(148,170,255,0.1)',
        }}
      >
        <img
          src={url}
          alt="Beleg-Vorschau"
          style={{
            display: 'block',
            maxWidth: '100%',
            borderRadius: '0.5rem',
          }}
        />
      </div>
    );
  }

  if (!isPdf) {
    return (
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          border: '1px solid rgba(148,170,255,0.1)',
          textAlign: 'center',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem', opacity: 0.5 }}
        >
          description
        </span>
        Vorschau für diesen Dateityp nicht verfügbar.
        <div style={{ marginTop: '0.75rem' }}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
          >
            Datei öffnen / herunterladen
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '0.75rem',
        padding: '0.75rem',
        border: '1px solid rgba(148,170,255,0.1)',
      }}
    >
      {loadError ? (
        <div style={{ padding: '1rem', color: 'var(--color-error)', fontSize: '0.85rem', fontFamily: 'var(--font-body)' }}>
          PDF konnte nicht geladen werden: {loadError}
          <div style={{ marginTop: '0.5rem' }}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
            >
              Direkt öffnen
            </a>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Document
              file={url}
              onLoadSuccess={(pdf) => {
                setPageCount(pdf.numPages);
                setLoadError(null);
              }}
              onLoadError={(err) => {
                setLoadError(err.message);
              }}
              loading={
                <div style={{ padding: '2rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
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
        </>
      )}
    </div>
  );
}

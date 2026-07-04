import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { ResearchSection } from '../../components/amazon/research/ResearchSection';
import {
  fetchGlobalResearch, getResearchImageObjectUrl,
  type GlobalResearchCard, type ResearchImage,
} from '../../api/amazon.api';

function isImage(att: ResearchImage): boolean {
  return (att.mime ?? '').startsWith('image/');
}
function fileIcon(att: ResearchImage): string {
  const mime = att.mime ?? '';
  const name = (att.original_name ?? '').toLowerCase();
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'picture_as_pdf';
  if (mime === 'message/rfc822' || name.endsWith('.eml') || name.endsWith('.msg')) return 'mail';
  if (mime.startsWith('audio/')) return 'audio_file';
  if (mime.startsWith('video/')) return 'video_file';
  return 'description';
}

// Read-only Bild-Vorschau (88x88), Objekt-URL mit Cleanup
function ImageThumb({ productId, att }: { productId: number; att: ResearchImage }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getResearchImageObjectUrl(productId, att.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, att.id]);
  return (
    <div style={{ width: 88, height: 88 }}>
      {src
        ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" className="w-full h-full object-cover rounded-md" /></a>
        : <div className="w-full h-full rounded-md" style={{ background: 'var(--color-surface-container-low)' }} />}
    </div>
  );
}

function GlobalCard({ card }: { card: GlobalResearchCard }) {
  const atts = card.images ?? [];
  const images = atts.filter(isImage);
  const files = atts.filter(a => !isImage(a));

  async function download(att: ResearchImage) {
    try {
      const url = await getResearchImageObjectUrl(card.product_id, att.id);
      const a = document.createElement('a');
      a.href = url; a.download = att.original_name ?? 'datei';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { /* Download fehlgeschlagen */ }
  }

  return (
    <div className="rounded-lg p-3"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Herkunft */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>inventory_2</span>
          <span>aus: <strong style={{ color: 'var(--color-on-surface)' }}>{card.product_name}</strong> · {card.topic_title}</span>
        </div>
        <Link to={`/amazon/entwicklung/products/${card.product_id}`}
          className="flex items-center gap-1 text-xs rounded px-2 py-0.5"
          style={{ color: 'var(--color-primary)', background: 'var(--color-surface-container-high)' }}>
          → Zum Produkt
        </Link>
      </div>

      {card.title && <div className="text-sm font-medium mb-1" style={{ color: 'var(--color-on-surface)' }}>{card.title}</div>}
      {card.body.trim() && (
        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--color-on-surface)' }}>{card.body}</p>
      )}

      {/* Links */}
      {(card.links?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {(card.links ?? []).map(l => (
            <div key={l.id} className="flex items-center gap-2 text-sm">
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-on-surface-variant)' }}>link</span>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate"
                style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
                {l.label || l.url}
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Nicht-Bild-Anhänge */}
      {files.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {files.map(att => (
            <button key={att.id} type="button" onClick={() => download(att)}
              className="flex items-center gap-2 text-sm rounded px-2 py-1 text-left"
              style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-on-surface)' }}
              title="Herunterladen">
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-surface-variant)' }}>{fileIcon(att)}</span>
              <span className="flex-1 min-w-0 truncate">{att.original_name ?? 'Datei'}</span>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-surface-variant)' }}>download</span>
            </button>
          ))}
        </div>
      )}

      {/* Bild-Vorschauen */}
      {images.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {images.map(att => <ImageThumb key={att.id} productId={card.product_id} att={att} />)}
        </div>
      )}
    </div>
  );
}

export function AmazonResearchGlobalPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['amazon', 'research', 'global', 'promoted'],
    queryFn: fetchGlobalResearch,
  });

  // Gruppierung nach Produkt (Reihenfolge bleibt wie vom Backend sortiert)
  const groups: { productId: number; productName: string; cards: GlobalResearchCard[] }[] = [];
  for (const card of data ?? []) {
    let g = groups.find(x => x.productId === card.product_id);
    if (!g) { g = { productId: card.product_id, productName: card.product_name, cards: [] }; groups.push(g); }
    g.cards.push(card);
  }

  return (
    <PageWrapper>
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--color-primary)' }}>menu_book</span>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-on-surface)' }}>Recherche &amp; Wissen</h1>
        </div>
        <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
          Eigene, produktunabhängige Recherche — plus alle aus Produkten geteilten Karten.
        </p>
      </div>

      {/* Eigener, editierbarer globaler Recherche-Bereich (produktunabhängig) */}
      <div className="mb-8">
        <ResearchSection scope="global" defaultOpen />
      </div>

      {/* Aus Produkten „global" geteilte Karten (read-only, mit Herkunft) */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-on-surface-variant)' }}>share</span>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--color-on-surface)' }}>Aus Produkten geteilt</h2>
        </div>

        {isLoading && (
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Lädt …</p>
        )}
        {isError && (
          <p className="text-sm" style={{ color: '#fca5a5' }}>Fehler beim Laden der geteilten Recherche-Karten.</p>
        )}
        {!isLoading && !isError && groups.length === 0 && (
          <div className="rounded-lg p-6 text-center text-sm"
            style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-on-surface-variant)' }}>
            Noch keine Karte aus einem Produkt geteilt. Öffne in einer Produkt-Recherche eine Karte und klicke auf das Globus-Symbol, um sie hier anzuzeigen.
          </div>
        )}

        <div className="flex flex-col gap-6">
          {groups.map(g => (
            <section key={g.productId}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-base font-medium" style={{ color: 'var(--color-on-surface)' }}>{g.productName}</h3>
                <span className="text-xs rounded-full px-2 py-0.5"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}>
                  {g.cards.length}
                </span>
              </div>
              <div className="flex flex-col gap-3">
                {g.cards.map(c => <GlobalCard key={c.id} card={c} />)}
              </div>
            </section>
          ))}
        </div>
      </section>
    </PageWrapper>
  );
}

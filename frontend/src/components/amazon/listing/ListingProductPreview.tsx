import { useEffect, useState } from 'react';
import { getAmazonProductImageObjectUrl, type ListingFields } from '../../../api/amazon.api';

// ── Bewusste Amazon-Nachbildung (read-only) ──────────────────────────────────
// Diese Komponente rendert eine realistische Amazon-PRODUKTSEITE (Detailseite)
// nur zur Ansicht aus den Listing-Feldern. Daher sind hier — wie im Vergleicher —
// die hartkodierten Amazon-Markenfarben und Arial ausdruecklich erlaubt
// (Ausnahme vom Electric-Noir-Token-Prinzip, weil echte Optik gewuenscht ist).
const AZ_INK = '#0F1111';        // Haupttext
const AZ_GREY = '#565959';       // Sekundaertext
const AZ_STAR = '#FFA41C';       // gefuellter Stern
const AZ_STAR_EMPTY = '#C7CDD1'; // leerer Stern
const AZ_LINK = '#007185';       // Review-Zahl / Links
const AZ_PRIME = '#00A8E1';      // Prime
const AZ_LINE = '#e7e7e7';       // Trennlinie
const AZ_FONT = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

function StarGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} style={{ display: 'block' }} aria-hidden="true">
      <path fill={color} d="M12 17.27l5.18 3.12-1.37-5.9 4.58-3.97-6.03-.52L12 4.5 9.64 10l-6.03.52 4.58 3.97-1.37 5.9z" />
    </svg>
  );
}
function Stars({ rating }: { rating: number | null }) {
  const value = rating ?? 0;
  return (
    <div className="flex items-center" style={{ lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} style={{ position: 'relative', width: 18, height: 18, display: 'inline-block' }}>
            <StarGlyph color={AZ_STAR_EMPTY} />
            <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${fill * 100}%` }}>
              <StarGlyph color={AZ_STAR} />
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function ListingProductPreview({
  productId, listing, productName,
}: {
  productId: number;
  listing: ListingFields;
  productName: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getAmazonProductImageObjectUrl(productId)
      .then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); setLoaded(true); })
      .catch(() => { setSrc(null); setLoaded(true); });
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId]);

  const title = listing.title?.trim() || productName;
  const bullets = [listing.bullet_1, listing.bullet_2, listing.bullet_3, listing.bullet_4, listing.bullet_5]
    .map(b => (b ?? '').trim())
    .filter(b => b.length > 0);
  const reviews = listing.comp_own_reviews;

  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 24, fontFamily: AZ_FONT, color: AZ_INK }}>
      <div className="flex flex-col md:flex-row" style={{ gap: 32 }}>
        {/* Links: Hauptbild */}
        <div className="flex items-start justify-center" style={{ flex: '0 0 42%', minWidth: 0 }}>
          <div className="w-full flex items-center justify-center" style={{ background: '#fff', minHeight: 320 }}>
            {src
              ? <img src={src} alt={title} style={{ maxWidth: '100%', maxHeight: 460, objectFit: 'contain' }} />
              : <span style={{ color: AZ_GREY, fontSize: 14 }}>{loaded ? 'Kein Hauptbild' : '…'}</span>}
          </div>
        </div>

        {/* Rechts: Titel / Sterne / Preis / Bullets / Beschreibung */}
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 400, lineHeight: 1.35, color: AZ_INK, margin: 0 }}>{title}</h1>
          <div style={{ fontSize: 12, color: AZ_LINK, marginTop: 4 }}>Besuche den {productName}-Store</div>

          {/* Sterne + Bewertungen */}
          <div className="flex items-center" style={{ gap: 8, marginTop: 8 }}>
            <Stars rating={listing.comp_own_rating} />
            {reviews != null && (
              <span style={{ color: AZ_LINK, fontSize: 14 }}>{reviews.toLocaleString('de-DE')} Bewertungen</span>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${AZ_LINE}`, marginTop: 14, paddingTop: 14 }} />

          {/* Preis */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <span style={{ fontSize: 28, fontWeight: 500, color: AZ_INK }}>
              {listing.comp_own_price?.trim() || '—'}
            </span>
          </div>
          <div style={{ marginTop: 4 }}>
            <span style={{ color: AZ_PRIME, fontWeight: 700, fontSize: 13 }}>prime</span>
            <span style={{ color: AZ_GREY, fontSize: 13 }}> GRATIS Lieferung</span>
          </div>

          <div style={{ borderTop: `1px solid ${AZ_LINE}`, marginTop: 16, paddingTop: 16 }} />

          {/* Über diesen Artikel */}
          <div style={{ fontWeight: 700, fontSize: 16, color: AZ_INK, marginBottom: 8 }}>Über diesen Artikel</div>
          {bullets.length > 0 ? (
            <ul style={{ listStyle: 'disc', paddingLeft: 20, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bullets.map((b, i) => (
                <li key={i} style={{ fontSize: 14, lineHeight: 1.4, color: AZ_INK }}>{b}</li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 13, color: AZ_GREY }}>Noch keine Stichpunkte hinterlegt.</div>
          )}

          <div style={{ borderTop: `1px solid ${AZ_LINE}`, marginTop: 16, paddingTop: 16 }} />

          {/* Produktbeschreibung */}
          <div style={{ fontWeight: 700, fontSize: 16, color: AZ_INK, marginBottom: 8 }}>Produktbeschreibung</div>
          {listing.description?.trim() ? (
            <div style={{ fontSize: 14, lineHeight: 1.5, color: AZ_INK, whiteSpace: 'pre-wrap' }}>
              {listing.description}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: AZ_GREY }}>Noch keine Beschreibung hinterlegt.</div>
          )}
        </div>
      </div>
    </div>
  );
}

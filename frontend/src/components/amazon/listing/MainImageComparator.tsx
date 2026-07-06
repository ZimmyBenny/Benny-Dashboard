import { useEffect, useRef, useState } from 'react';
import {
  getListingImageObjectUrl, getAmazonProductImageObjectUrl,
  type ListingImage, type ListingImagePatch, type ListingPatch,
} from '../../../api/amazon.api';
import {
  useUploadListingImage, useDeleteListingImage, useUpdateListingImage, useUpdateListing,
} from '../../../hooks/amazon/useListing';

// ── Bewusste Amazon-Nachbildung ──────────────────────────────────────────────
// Dieser Vergleicher ist eine realistische Vorschau einer Amazon-Suchergebnis-
// Seite. Daher sind hier die hartkodierten Amazon-Markenfarben (weisses Panel,
// #0F1111 Text, #565959 grau, #FFA41C Sterne, #C7CDD1 leere Sterne, #007185
// Review-Links, #00A8E1 Prime) ausdruecklich erlaubt — Ausnahme vom Electric-
// Noir-Token-Prinzip, weil die Optik echt aussehen soll.
const AZ_INK = '#0F1111';       // Haupttext (fast schwarz)
const AZ_GREY = '#565959';      // Sekundaertext
const AZ_STAR = '#FFA41C';      // gefuellter Stern
const AZ_STAR_EMPTY = '#C7CDD1';// leerer Stern
const AZ_LINK = '#007185';      // Review-Zahl / Links
const AZ_PRIME = '#00A8E1';     // Prime-Badge
const AZ_PANEL = '#ffffff';     // helles Panel
const AZ_CARD_BORDER = '#e7e7e7';
const OWN_ACCENT = '#fb923c';   // eigener Rahmen (Electric-Noir-Orange, absichtlich)

const MAX_BYTES = 20 * 1024 * 1024;

// ── Sterne-Reihe (0–5, halbe Sterne moeglich, optional klickbar) ──────────────
function Stars({ rating, onPick }: { rating: number | null; onPick?: (v: number) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const value = hover ?? rating ?? 0;
  const editable = !!onPick;
  return (
    <div className="flex items-center" style={{ lineHeight: 1 }}
      onMouseLeave={() => setHover(null)}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1))); // 0..1 fuer Stern i
        return (
          <span
            key={i}
            role={editable ? 'button' : undefined}
            title={editable ? `${i} Sterne` : undefined}
            onMouseEnter={editable ? () => setHover(i) : undefined}
            onClick={editable ? () => onPick!(i) : undefined}
            style={{
              position: 'relative', width: 15, height: 15, display: 'inline-block',
              cursor: editable ? 'pointer' : 'default',
            }}
          >
            {/* leerer Grundstern */}
            <StarGlyph color={AZ_STAR_EMPTY} />
            {/* gefuellter Teil per clip */}
            <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${fill * 100}%` }}>
              <StarGlyph color={AZ_STAR} />
            </span>
          </span>
        );
      })}
    </div>
  );
}
function StarGlyph({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} style={{ display: 'block' }} aria-hidden="true">
      <path fill={color} d="M12 17.27l5.18 3.12-1.37-5.9 4.58-3.97-6.03-.52L12 4.5 9.64 10l-6.03.52 4.58 3.97-1.37 5.9z" />
    </svg>
  );
}

// ── randloser Text-Input, der erst bei Fokus einen dezenten Rahmen zeigt ──────
function CardInput({
  value, onSave, placeholder, bold, ink = AZ_INK, size = 13, align = 'left', numeric = false,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  bold?: boolean;
  ink?: string;
  size?: number;
  align?: 'left' | 'right';
  numeric?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const last = useRef(value);
  useEffect(() => { setLocal(value); last.current = value; }, [value]);
  function save() {
    if (local === last.current) return;
    last.current = local;
    onSave(local);
  }
  return (
    <input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder={placeholder}
      inputMode={numeric ? 'numeric' : undefined}
      className="w-full rounded outline-none"
      style={{
        background: 'transparent',
        color: ink,
        fontSize: size,
        fontWeight: bold ? 700 : 400,
        textAlign: align,
        border: '1px solid transparent',
        padding: '1px 3px',
      }}
      onFocus={(e) => { e.target.style.border = `1px solid ${AZ_CARD_BORDER}`; e.target.style.background = '#fff'; }}
      onBlurCapture={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }}
    />
  );
}

function fmtReviews(n: number | null): string {
  if (n == null) return '';
  return n.toLocaleString('de-DE');
}

// ── Karten-Grundgeruest (weisse Amazon-Karte) ─────────────────────────────────
function Card({ own, children, onDelete }: { own?: boolean; children: React.ReactNode; onDelete?: () => void }) {
  return (
    <div
      className="group relative flex flex-col rounded-md"
      style={{
        background: '#fff',
        border: own ? `2px solid ${OWN_ACCENT}` : `1px solid ${AZ_CARD_BORDER}`,
        padding: 10,
      }}
    >
      {own && (
        <span className="absolute z-10 text-[11px] px-1.5 py-0.5 rounded font-semibold"
          style={{ top: 6, left: 6, background: OWN_ACCENT, color: '#1a1a1a' }}>
          Dein Produkt
        </span>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete}
          className="absolute z-10 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ top: 6, right: 6, background: 'rgba(0,0,0,0.55)', color: '#fca5a5', padding: '2px 4px' }}
          aria-label="Wettbewerber-Karte entfernen" title="Entfernen">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      )}
      {children}
    </div>
  );
}

// gemeinsamer unterer Karten-Block (Titel/Sterne/Reviews/Preis) — fuer eigen & Wettbewerber.
function CardBody({
  title, price, rating, reviews, prime,
  onTitle, onPrice, onRating, onReviews,
}: {
  title: string; price: string; rating: number | null; reviews: number | null; prime?: boolean;
  onTitle: (v: string) => void; onPrice: (v: string) => void;
  onRating: (v: number) => void; onReviews: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 mt-2">
      {/* Titel: 2 Zeilen — hier als Input (Amazon-Look) */}
      <div style={{ minHeight: 34 }}>
        <CardInput value={title} onSave={onTitle} placeholder="Produkttitel …" ink={AZ_INK} size={13} />
      </div>
      {/* Sterne + Reviews */}
      <div className="flex items-center gap-1.5" style={{ paddingLeft: 3 }}>
        <Stars rating={rating} onPick={onRating} />
        <input
          value={reviews == null ? '' : String(reviews)}
          onChange={() => { /* controlled via onSave below */ }}
          onBlur={(e) => onReviews(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="0"
          inputMode="numeric"
          className="rounded outline-none"
          style={{
            width: 60, background: 'transparent', color: AZ_LINK, fontSize: 12,
            border: '1px solid transparent', padding: '1px 3px',
          }}
          onFocus={(e) => { e.target.style.border = `1px solid ${AZ_CARD_BORDER}`; e.target.style.background = '#fff'; }}
          title="Anzahl Bewertungen"
          defaultValue={reviews == null ? '' : String(reviews)}
          key={reviews == null ? 'empty' : String(reviews)}
        />
        {reviews != null && <span style={{ color: AZ_LINK, fontSize: 12 }}>({fmtReviews(reviews)})</span>}
      </div>
      {/* Prime-Badge (optional) */}
      {prime && (
        <span className="text-[11px] font-bold" style={{ color: AZ_PRIME, paddingLeft: 3 }}>prime</span>
      )}
      {/* Preis */}
      <div style={{ paddingLeft: 0 }}>
        <CardInput value={price} onSave={onPrice} placeholder="39,99 €" bold ink={AZ_INK} size={16} />
      </div>
    </div>
  );
}

// ── Eigene Karte ──────────────────────────────────────────────────────────────
function OwnCard({
  productId, listing,
}: {
  productId: number;
  listing: {
    title: string;
    comp_own_title: string | null; comp_own_price: string | null;
    comp_own_rating: number | null; comp_own_reviews: number | null;
  };
}) {
  const update = useUpdateListing(productId);
  const [src, setSrc] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getAmazonProductImageObjectUrl(productId)
      .then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); setLoaded(true); })
      .catch(() => { setSrc(null); setLoaded(true); });
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId]);

  function patch(p: ListingPatch) { update.mutate(p); }

  const shownTitle = listing.comp_own_title ?? listing.title ?? '';
  return (
    <Card own>
      <div className="relative w-full aspect-square rounded-sm overflow-hidden flex items-center justify-center" style={{ background: '#fff' }}>
        {src
          ? <img src={src} alt="Eigenes Hauptbild" className="max-w-full max-h-full object-contain" />
          : <span style={{ color: AZ_GREY, fontSize: 12 }}>{loaded ? 'Kein Hauptbild' : '…'}</span>}
      </div>
      <CardBody
        title={shownTitle}
        price={listing.comp_own_price ?? ''}
        rating={listing.comp_own_rating}
        reviews={listing.comp_own_reviews}
        prime
        onTitle={(v) => patch({ comp_own_title: v.trim() === '' ? null : v })}
        onPrice={(v) => patch({ comp_own_price: v.trim() === '' ? null : v })}
        onRating={(v) => patch({ comp_own_rating: v })}
        onReviews={(v) => patch({ comp_own_reviews: v.trim() === '' ? null : Number(v.replace(/\D/g, '')) })}
      />
    </Card>
  );
}

// ── Wettbewerber-Karte ────────────────────────────────────────────────────────
function CompetitorCard({ productId, image, onDelete }: { productId: number; image: ListingImage; onDelete: () => void }) {
  const update = useUpdateListingImage(productId);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getListingImageObjectUrl(productId, image.id)
      .then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); })
      .catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, image.id]);

  function patch(p: ListingImagePatch) { update.mutate({ imageId: image.id, patch: p }); }

  return (
    <Card onDelete={onDelete}>
      <div className="relative w-full aspect-square rounded-sm overflow-hidden flex items-center justify-center" style={{ background: '#fff' }}>
        {src
          ? <img src={src} alt="" className="max-w-full max-h-full object-contain" />
          : <span style={{ color: AZ_GREY, fontSize: 12 }}>…</span>}
      </div>
      <CardBody
        title={image.card_title ?? ''}
        price={image.card_price ?? ''}
        rating={image.card_rating}
        reviews={image.card_reviews}
        onTitle={(v) => patch({ card_title: v.trim() === '' ? null : v })}
        onPrice={(v) => patch({ card_price: v.trim() === '' ? null : v })}
        onRating={(v) => patch({ card_rating: v })}
        onReviews={(v) => patch({ card_reviews: v.trim() === '' ? null : Number(v.replace(/\D/g, '')) })}
      />
    </Card>
  );
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────
export function MainImageComparator({
  productId, competitorImages, listing,
}: {
  productId: number;
  competitorImages: ListingImage[];
  listing: {
    title: string;
    comp_own_title: string | null; comp_own_price: string | null;
    comp_own_rating: number | null; comp_own_reviews: number | null;
  };
}) {
  const upload = useUploadListingImage(productId);
  const del = useDeleteListingImage(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr('Datei größer als 20 MB.'); return; }
    setErr(null);
    upload.mutate({ kind: 'competitor', file: f });
  }
  function pickMany(files: FileList | null | undefined) {
    if (!files) return;
    Array.from(files).forEach(pick);
  }

  const searchTerm = listing.comp_own_title || listing.title || 'Mein Produkt';

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>Hauptbild-Vergleich</h3>
      <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
        Deine Karte neben Wettbewerber-Karten — wie eine Amazon-Suchergebnis-Seite.
      </p>

      {/* helles Amazon-Panel */}
      <div style={{ background: AZ_PANEL, borderRadius: 10, padding: 16 }}>
        {/* angedeutete Amazon-Suchleiste */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center flex-1 rounded-md overflow-hidden" style={{ border: `1px solid ${AZ_CARD_BORDER}` }}>
            <span className="px-2 text-[13px]" style={{ color: AZ_GREY, background: '#f3f3f3', paddingTop: 6, paddingBottom: 6 }}>Alle</span>
            <span className="px-2 flex-1 truncate" style={{ color: AZ_INK, fontSize: 13, paddingTop: 6, paddingBottom: 6 }}>{searchTerm}</span>
            <span className="material-symbols-outlined" style={{ color: '#fff', background: '#febd69', padding: '6px 10px', fontSize: 18 }}>search</span>
          </div>
        </div>

        {/* Raster */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 16 }}>
          <OwnCard productId={productId} listing={listing} />
          {competitorImages.map(im => (
            <CompetitorCard key={im.id} productId={productId} image={im} onDelete={() => del.mutate(im.id)} />
          ))}
          {/* Upload-/Add-Kachel */}
          <button type="button" onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickMany(e.dataTransfer.files); }}
            className="flex flex-col items-center justify-center rounded-md aspect-square"
            style={{ border: `1px dashed ${AZ_CARD_BORDER}`, color: AZ_GREY, background: '#fafafa', minHeight: 190 }}
            aria-label="Wettbewerber-Karte hinzufügen" title="Wettbewerber-Bild hinzufügen (oder hierher ziehen)">
            <span className="material-symbols-outlined" style={{ fontSize: 28 }}>add_photo_alternate</span>
            <span className="text-xs mt-1">Wettbewerber</span>
          </button>
        </div>
      </div>

      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { pickMany(e.target.files); e.target.value = ''; }} />
      {err && <p className="text-xs" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}

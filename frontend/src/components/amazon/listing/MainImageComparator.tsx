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

// ── Titel-Input: genau 2 Zeilen wie Amazon (line-clamp), randlos, Auto-Save ────
function TitleInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [focused, setFocused] = useState(false);
  const last = useRef(value);
  useEffect(() => { setLocal(value); last.current = value; }, [value]);
  function save() {
    setFocused(false);
    if (local === last.current) return;
    last.current = local;
    onSave(local);
  }
  // Im Fokus: echtes 2-zeiliges Textfeld zum Tippen.
  if (focused) {
    return (
      <textarea
        autoFocus
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={save}
        rows={2}
        placeholder="Produkttitel …"
        className="w-full rounded outline-none resize-none"
        style={{
          background: '#fff', color: AZ_INK, fontSize: 13, lineHeight: '18px',
          border: `1px solid ${AZ_CARD_BORDER}`, padding: '1px 3px', height: 40,
        }}
      />
    );
  }
  // Ohne Fokus: 2-Zeilen-Clamp-Darstellung (Amazon-Look), klickbar zum Editieren.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setFocused(true)}
      onFocus={() => setFocused(true)}
      title="Zum Bearbeiten klicken"
      style={{
        color: local ? AZ_INK : AZ_GREY, fontSize: 13, lineHeight: '18px',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', minHeight: 36, cursor: 'text',
        border: '1px solid transparent', padding: '1px 3px',
      }}
    >
      {local || 'Produkttitel …'}
    </div>
  );
}

function fmtReviews(n: number | null): string {
  if (n == null) return '';
  return n.toLocaleString('de-DE');
}

// ── echtes Amazon-„prime" — kleiner blauer Swoosh/Haken + „prime" fett blau ───
function PrimeBadge() {
  return (
    <span className="inline-flex items-center gap-1" style={{ lineHeight: 1 }}>
      <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true" style={{ display: 'block' }}>
        {/* geschwungener Amazon-„smile"-Swoosh */}
        <path fill="none" stroke={AZ_PRIME} strokeWidth={2.4} strokeLinecap="round"
          d="M3 14c4 3.5 14 3.5 18 0" />
        <path fill={AZ_PRIME} d="M19 12.5l2.6 1.2-1.9 2.1z" />
      </svg>
      <span style={{ color: AZ_PRIME, fontWeight: 700, fontSize: 12, fontStyle: 'italic' }}>prime</span>
    </span>
  );
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
      {/* Kein Text-Badge mehr — die eigene Karte wird NUR am orangen Rahmen erkannt. */}
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

// gemeinsamer unterer Karten-Block — Reihenfolge wie echter Amazon-Suchtreffer:
// Titel → Sterne+Bewertungen → „X Mal gekauft" → Preis (+prime) → gelber Button.
function CardBody({
  title, price, rating, reviews, sold, prime,
  onTitle, onPrice, onRating, onReviews, onSold,
}: {
  title: string; price: string; rating: number | null; reviews: number | null; sold: string; prime?: boolean;
  onTitle: (v: string) => void; onPrice: (v: string) => void;
  onRating: (v: number) => void; onReviews: (v: string) => void; onSold: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1 mt-2">
      {/* Titel: genau 2 Zeilen (line-clamp), feste Min-Höhe → Karten gleich hoch */}
      <div style={{ minHeight: 36 }}>
        <TitleInput value={title} onSave={onTitle} />
      </div>
      {/* Sterne + Reviews */}
      <div className="flex items-center gap-1.5" style={{ paddingLeft: 3 }}>
        <Stars rating={rating} onPick={onRating} />
        <input
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
      {/* „X Mal gekauft"-Zeile — klein/grau, editierbar */}
      <div style={{ paddingLeft: 3 }}>
        <CardInput
          value={sold}
          onSave={onSold}
          placeholder="z. B. 500+ Mal im letzten Monat gekauft"
          ink={AZ_GREY}
          size={12}
        />
      </div>
      {/* Preis */}
      <div style={{ paddingLeft: 0 }}>
        <CardInput value={price} onSave={onPrice} placeholder="39,99 €" bold ink={AZ_INK} size={16} />
      </div>
      {/* echtes Prime-Badge — auf jeder Karte, sauber angefügt */}
      {prime && (
        <div style={{ paddingLeft: 3 }}>
          <PrimeBadge />
        </div>
      )}
      {/* gelber „In den Einkaufswagen"-Button — REIN DEKORATIV (kein onClick) */}
      <div
        aria-hidden="true"
        className="mt-1 w-full text-center select-none"
        style={{
          background: '#FFD814', color: AZ_INK, border: '1px solid #FCD200',
          borderRadius: 18, fontSize: 12, fontWeight: 500, padding: '5px 0',
        }}
      >
        In den Einkaufswagen
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
    comp_own_sold: string | null;
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
        sold={listing.comp_own_sold ?? ''}
        prime
        onTitle={(v) => patch({ comp_own_title: v.trim() === '' ? null : v })}
        onPrice={(v) => patch({ comp_own_price: v.trim() === '' ? null : v })}
        onRating={(v) => patch({ comp_own_rating: v })}
        onReviews={(v) => patch({ comp_own_reviews: v.trim() === '' ? null : Number(v.replace(/\D/g, '')) })}
        onSold={(v) => patch({ comp_own_sold: v.trim() === '' ? null : v })}
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
        sold={image.card_sold ?? ''}
        prime
        onTitle={(v) => patch({ card_title: v.trim() === '' ? null : v })}
        onPrice={(v) => patch({ card_price: v.trim() === '' ? null : v })}
        onRating={(v) => patch({ card_rating: v })}
        onReviews={(v) => patch({ card_reviews: v.trim() === '' ? null : Number(v.replace(/\D/g, '')) })}
        onSold={(v) => patch({ card_sold: v.trim() === '' ? null : v })}
      />
    </Card>
  );
}

// ── Haupt-Komponente ──────────────────────────────────────────────────────────
export function MainImageComparator({
  productId, competitorImages, listing, productName,
}: {
  productId: number;
  competitorImages: ListingImage[];
  listing: {
    title: string;
    comp_own_title: string | null; comp_own_price: string | null;
    comp_own_rating: number | null; comp_own_reviews: number | null;
    comp_own_sold: string | null;
    comp_search_term: string | null;
  };
  productName?: string;
}) {
  const upload = useUploadListingImage(productId);
  const del = useDeleteListingImage(productId);
  const updateListing = useUpdateListing(productId);
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

  // Fallback-Suchbegriff = Produktname (bzw. Titel), Anzeige aus comp_search_term.
  const searchFallback = productName || listing.title || 'Mein Produkt';

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>Hauptbild-Vergleich</h3>
      <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
        Deine Karte neben Wettbewerber-Karten — wie eine Amazon-Suchergebnis-Seite.
      </p>

      {/* helles Amazon-Panel */}
      <div style={{ background: AZ_PANEL, borderRadius: 10, padding: 16 }}>
        {/* Amazon-Suchleiste — Suchbegriff editierbar (Auto-Save) */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center flex-1 rounded-md overflow-hidden" style={{ border: `1px solid ${AZ_CARD_BORDER}` }}>
            <span className="px-2 text-[13px]" style={{ color: AZ_GREY, background: '#f3f3f3', paddingTop: 6, paddingBottom: 6 }}>Alle</span>
            <input
              className="px-2 flex-1 outline-none"
              style={{ color: AZ_INK, fontSize: 13, paddingTop: 6, paddingBottom: 6, background: '#fff', minWidth: 0 }}
              placeholder={searchFallback}
              defaultValue={listing.comp_search_term ?? ''}
              key={listing.comp_search_term ?? ''}
              onBlur={(e) => {
                const v = e.target.value;
                if ((listing.comp_search_term ?? '') === v) return;
                updateListing.mutate({ comp_search_term: v.trim() === '' ? null : v });
              }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              aria-label="Amazon-Suchbegriff"
            />
            <span className="material-symbols-outlined" style={{ color: '#fff', background: '#febd69', padding: '6px 10px', fontSize: 18 }}>search</span>
          </div>
        </div>

        {/* Raster: 5 Karten pro Zeile (bei genug Wettbewerbern 2. Zeile → bis 10 sichtbar);
            responsiv weniger Spalten auf schmaler Breite. */}
        <div className="az-search-grid" style={{ display: 'grid', gap: 16 }}>
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
        {/* 5 Spalten fix, responsiv abfallend */}
        <style>{`
          .az-search-grid { grid-template-columns: repeat(5, 1fr); }
          @media (max-width: 1100px) { .az-search-grid { grid-template-columns: repeat(4, 1fr); } }
          @media (max-width: 860px)  { .az-search-grid { grid-template-columns: repeat(3, 1fr); } }
          @media (max-width: 620px)  { .az-search-grid { grid-template-columns: repeat(2, 1fr); } }
        `}</style>
      </div>

      <input ref={fileInput} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { pickMany(e.target.files); e.target.value = ''; }} />
      {err && <p className="text-xs" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getCompetitorFileObjectUrl, type Competitor, type CompetitorFile, type CompetitorPatch } from '../../../api/amazon.api';
import { useUpdateCompetitor } from '../../../hooks/amazon/useCompetitors';
import { CompetitorFiles } from './CompetitorFiles';
import { ByteCounter } from '../listing/ByteCounter';

/**
 * Kleines Vorschaubild (44x44) des ersten Bild-Anhangs — zum schnellen Wiedererkennen
 * des Listings. 2 Sekunden mit der Maus draufbleiben → große Vorschau (Portal, nicht geclippt).
 */
function CardThumb({ productId, files }: { productId: number; files: CompetitorFile[] }) {
  const first = files.find(f => (f.mime ?? '').startsWith('image/'));
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!first) { setSrc(null); return; }
    let revoked = false; let url: string | null = null;
    getCompetitorFileObjectUrl(productId, first.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, first]);

  // Hover-Vergrößerung nach 2 s
  const ref = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | null>(null);
  const [big, setBig] = useState<{ left: number; top: number } | null>(null);
  const BIG = 380;
  function onEnter() {
    if (!src) return;
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      let left = r.right + 8;
      if (left + BIG > window.innerWidth - 8) left = Math.max(8, r.left - BIG - 8); // links, wenn rechts kein Platz
      const top = Math.min(Math.max(8, r.top), window.innerHeight - BIG - 8);
      setBig({ left, top });
    }, 2000);
  }
  function onLeave() {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    setBig(null);
  }
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  return (
    <>
      <div ref={ref} onMouseEnter={onEnter} onMouseLeave={onLeave}
        className="shrink-0 flex items-center justify-center rounded-md overflow-hidden"
        style={{ width: 44, height: 44, background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.08)', cursor: src ? 'zoom-in' : 'default' }}>
        {src
          ? <img src={src} alt="" className="w-full h-full object-cover" />
          : <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-on-surface-variant)', opacity: 0.5 }}>image</span>}
      </div>
      {big && src && createPortal(
        <div style={{ position: 'fixed', left: big.left, top: big.top, zIndex: 200, pointerEvents: 'none' }}>
          <img src={src} alt="" style={{
            maxWidth: BIG, maxHeight: BIG, objectFit: 'contain', background: '#fff',
            borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
          }} />
        </div>,
        document.body,
      )}
    </>
  );
}

const ACCENT = '#fb7185';
const AUTOSAVE_MS = 600;

/** "YYYY-MM-DD" -> "DD.MM.YYYY" (leer bleibt leer). */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}.${m}.${y}` : iso;
}
function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

/** Ein Mitbewerber. Textfelder speichern debounced automatisch; Stern/Link sofort. */
export function CompetitorCard({ productId, competitor, onRequestDelete }: {
  productId: number;
  competitor: Competitor;
  onRequestDelete: () => void;
}) {
  const update = useUpdateCompetitor(productId);

  // Lokaler String-State je Feld (auch rating/reviews als String im Input).
  const [asin, setAsin] = useState(competitor.asin);
  const [url, setUrl] = useState(competitor.url);
  const [title, setTitle] = useState(competitor.title);
  const [subtitle, setSubtitle] = useState(competitor.subtitle);
  const [brand, setBrand] = useState(competitor.brand);
  const [price, setPrice] = useState(competitor.price);
  const [rating, setRating] = useState(competitor.rating == null ? '' : String(competitor.rating));
  const [reviews, setReviews] = useState(competitor.reviews == null ? '' : String(competitor.reviews));
  const [checkedOn, setCheckedOn] = useState(competitor.checked_on);
  const [strengths, setStrengths] = useState(competitor.strengths);
  const [weaknesses, setWeaknesses] = useState(competitor.weaknesses);
  const [neutral, setNeutral] = useState(competitor.neutral);
  const [differentiation, setDifferentiation] = useState(competitor.differentiation);

  // Bei Server-Änderung (z.B. Reorder/Reload) nachziehen.
  useEffect(() => {
    setAsin(competitor.asin); setUrl(competitor.url); setTitle(competitor.title); setSubtitle(competitor.subtitle); setBrand(competitor.brand); setPrice(competitor.price);
    setRating(competitor.rating == null ? '' : String(competitor.rating));
    setReviews(competitor.reviews == null ? '' : String(competitor.reviews));
    setCheckedOn(competitor.checked_on);
    setStrengths(competitor.strengths); setWeaknesses(competitor.weaknesses); setNeutral(competitor.neutral); setDifferentiation(competitor.differentiation);
  }, [competitor]);

  const dateRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<number | null>(null);
  function saveDebounced(patch: CompetitorPatch) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; update.mutate({ cid: competitor.id, patch }); }, AUTOSAVE_MS);
  }
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const isMain = competitor.is_main === 1;

  return (
    <div className="rounded-xl p-4 mb-6" style={{
      background: 'var(--color-surface-container)',
      border: `1px solid ${isMain ? 'rgba(251,113,133,0.5)' : 'rgba(255,255,255,0.12)'}`,
      borderLeft: `3px solid ${isMain ? ACCENT : 'rgba(251,113,133,0.4)'}`,
      boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
    }}>
      {/* Kopf: Vorschaubild · Stern · Marke (oben, prominent) · Löschen */}
      <div className="flex items-center gap-2 mb-2">
        <CardThumb productId={productId} files={competitor.files} />
        <button type="button" title={isMain ? 'Hauptkonkurrent (aktiv)' : 'Als Hauptkonkurrent markieren'}
          onClick={() => update.mutate({ cid: competitor.id, patch: { is_main: isMain ? 0 : 1 } })}
          className="shrink-0 rounded p-1" style={{ color: isMain ? ACCENT : 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: isMain ? "'FILL' 1" : "'FILL' 0" }}>star</span>
        </button>
        <input value={brand} onChange={(e) => { setBrand(e.target.value); saveDebounced({ brand: e.target.value }); }}
          placeholder="Marke / Verkäufer" spellCheck={false}
          className="flex-1 rounded-md px-2.5 py-1.5 text-base font-semibold" style={inputStyle} />
        <button type="button" onClick={onRequestDelete} aria-label="Mitbewerber löschen" className="shrink-0 rounded p-1 hover:bg-white/10">
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fca5a5' }}>delete</span>
        </button>
      </div>

      {/* Titel + Untertitel (volle Breite), je mit Byte-Zähler (nur zählen, kein Limit) */}
      <div className="mb-1.5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Titel</span>
          <ByteCounter value={title} />
        </div>
        <input value={title} onChange={(e) => { setTitle(e.target.value); saveDebounced({ title: e.target.value }); }}
          placeholder="Titel des Konkurrenzprodukts" spellCheck={false}
          className="w-full rounded-md px-2.5 py-1.5 text-sm" style={inputStyle} />
      </div>
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Untertitel</span>
          <ByteCounter value={subtitle} />
        </div>
        <textarea value={subtitle} onChange={(e) => { setSubtitle(e.target.value); saveDebounced({ subtitle: e.target.value }); }}
          placeholder="Zweite Amazon-Zeile (Bullet-Zusammenfassung) …" spellCheck={false} rows={2}
          className="w-full rounded-md px-2.5 py-1.5 text-sm resize-y" style={inputStyle} />
      </div>

      {/* ASIN + Link */}
      <div className="flex flex-wrap gap-2 mb-2">
        <input value={asin} onChange={(e) => { setAsin(e.target.value); saveDebounced({ asin: e.target.value }); }}
          placeholder="ASIN" spellCheck={false} className="rounded-md px-2.5 py-1.5 text-sm" style={{ ...inputStyle, width: 140 }} />
        <input value={url} onChange={(e) => { setUrl(e.target.value); saveDebounced({ url: e.target.value }); }}
          placeholder="Amazon-Link (https://…)" spellCheck={false} className="flex-1 rounded-md px-2.5 py-1.5 text-sm" style={{ ...inputStyle, minWidth: 180 }} />
        {url.trim() && (
          <a href={url.trim()} target="_blank" rel="noopener noreferrer" title="Auf Amazon öffnen"
            className="flex items-center justify-center rounded-md px-2" style={{ ...inputStyle, color: ACCENT }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>
          </a>
        )}
      </div>

      {/* Preis · Sterne · Bewertungen */}
      <div className="flex flex-wrap gap-2 mb-3">
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          Preis
          <input value={price} onChange={(e) => { setPrice(e.target.value); saveDebounced({ price: e.target.value }); }}
            placeholder="z. B. 39,99 €" className="rounded-md px-2 py-1 text-sm" style={{ ...inputStyle, width: 100 }} />
        </label>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          Sterne
          <input value={rating} inputMode="decimal" onChange={(e) => { setRating(e.target.value); saveDebounced({ rating: e.target.value === '' ? null : Number(e.target.value.replace(',', '.')) }); }}
            placeholder="0–5" className="rounded-md px-2 py-1 text-sm" style={{ ...inputStyle, width: 64 }} />
        </label>
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          Bewertungen
          <input value={reviews} inputMode="numeric" onChange={(e) => { setReviews(e.target.value); saveDebounced({ reviews: e.target.value === '' ? null : Number(e.target.value) }); }}
            placeholder="Anzahl" className="rounded-md px-2 py-1 text-sm" style={{ ...inputStyle, width: 90 }} />
        </label>
        {/* Stand: leer = nichts anzeigen. Kalender-Knopf (manuell) + schöner „heute"-Knopf. */}
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--color-on-surface-variant)' }} title="Wann hast du diese Zahlen abgelesen?">
          <span>Stand</span>
          {checkedOn && (
            <span className="inline-flex items-center gap-1 rounded-md px-2 py-1" style={{ ...inputStyle, color: 'var(--color-on-surface)' }}>
              {fmtDate(checkedOn)}
              <button type="button" title="Datum entfernen"
                onClick={() => { setCheckedOn(''); saveDebounced({ checked_on: '' }); }}
                className="inline-flex leading-none">
                <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--color-on-surface-variant)' }}>close</span>
              </button>
            </span>
          )}
          {/* verstecktes natives Datumsfeld — nur für den Picker (manuelle Eingabe) */}
          <input ref={dateRef} type="date" value={checkedOn} tabIndex={-1} aria-hidden
            onChange={(e) => { setCheckedOn(e.target.value); saveDebounced({ checked_on: e.target.value }); }}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
          <button type="button" title="Datum wählen"
            onClick={() => { const el = dateRef.current as (HTMLInputElement & { showPicker?: () => void }) | null; try { el?.showPicker?.(); } catch { el?.focus(); } }}
            className="inline-flex items-center rounded-md px-1.5 py-1" style={{ ...inputStyle, cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_month</span>
          </button>
          <button type="button" title="Heutiges Datum eintragen"
            onClick={() => { const t = todayIso(); setCheckedOn(t); saveDebounced({ checked_on: t }); }}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium"
            style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}55`, cursor: 'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>today</span>
            heute
          </button>
        </div>
      </div>

      {/* Analyse: Stärken · Schwächen · Neutral · Differenzierung */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Stärken" value={strengths} onChange={(v) => { setStrengths(v); saveDebounced({ strengths: v }); }} />
        <Field label="Schwächen" value={weaknesses} onChange={(v) => { setWeaknesses(v); saveDebounced({ weaknesses: v }); }} />
        <Field label="Neutral (z.B. Kartonstärke, Maße)" value={neutral} onChange={(v) => { setNeutral(v); saveDebounced({ neutral: v }); }} />
        <Field label="Meine Differenzierung" value={differentiation} onChange={(v) => { setDifferentiation(v); saveDebounced({ differentiation: v }); }} />
      </div>

      {/* Screenshots/Anhänge */}
      <CompetitorFiles productId={productId} competitorId={competitor.id} files={competitor.files} />
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} spellCheck={false}
        className="w-full rounded-md px-2.5 py-1.5 text-sm resize-y" style={inputStyle} />
    </div>
  );
}

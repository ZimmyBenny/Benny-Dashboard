import { useEffect, useRef, useState } from 'react';
import { type Competitor, type CompetitorPatch } from '../../../api/amazon.api';
import { useUpdateCompetitor } from '../../../hooks/amazon/useCompetitors';
import { CompetitorFiles } from './CompetitorFiles';

const ACCENT = '#fb7185';
const AUTOSAVE_MS = 600;

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
  const [price, setPrice] = useState(competitor.price);
  const [rating, setRating] = useState(competitor.rating == null ? '' : String(competitor.rating));
  const [reviews, setReviews] = useState(competitor.reviews == null ? '' : String(competitor.reviews));
  const [strengths, setStrengths] = useState(competitor.strengths);
  const [weaknesses, setWeaknesses] = useState(competitor.weaknesses);
  const [differentiation, setDifferentiation] = useState(competitor.differentiation);

  // Bei Server-Änderung (z.B. Reorder/Reload) nachziehen.
  useEffect(() => {
    setAsin(competitor.asin); setUrl(competitor.url); setTitle(competitor.title); setPrice(competitor.price);
    setRating(competitor.rating == null ? '' : String(competitor.rating));
    setReviews(competitor.reviews == null ? '' : String(competitor.reviews));
    setStrengths(competitor.strengths); setWeaknesses(competitor.weaknesses); setDifferentiation(competitor.differentiation);
  }, [competitor]);

  const timer = useRef<number | null>(null);
  function saveDebounced(patch: CompetitorPatch) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; update.mutate({ cid: competitor.id, patch }); }, AUTOSAVE_MS);
  }
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);

  const isMain = competitor.is_main === 1;

  return (
    <div className="rounded-xl p-3 mb-3" style={{
      background: 'var(--color-surface-container-low)',
      border: `1px solid ${isMain ? 'rgba(251,113,133,0.45)' : 'rgba(255,255,255,0.07)'}`,
    }}>
      {/* Kopf: Stern · Titel · Löschen */}
      <div className="flex items-center gap-2 mb-2">
        <button type="button" title={isMain ? 'Hauptkonkurrent (aktiv)' : 'Als Hauptkonkurrent markieren'}
          onClick={() => update.mutate({ cid: competitor.id, patch: { is_main: isMain ? 0 : 1 } })}
          className="shrink-0 rounded p-1" style={{ color: isMain ? ACCENT : 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: isMain ? "'FILL' 1" : "'FILL' 0" }}>star</span>
        </button>
        <input value={title} onChange={(e) => { setTitle(e.target.value); saveDebounced({ title: e.target.value }); }}
          placeholder="Titel des Konkurrenzprodukts" spellCheck={false}
          className="flex-1 rounded-md px-2.5 py-1.5 text-sm font-medium" style={inputStyle} />
        <button type="button" onClick={onRequestDelete} aria-label="Mitbewerber löschen" className="shrink-0 rounded p-1 hover:bg-white/10">
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fca5a5' }}>delete</span>
        </button>
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
      </div>

      {/* Analyse: Stärken · Schwächen · Differenzierung */}
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Stärken" value={strengths} onChange={(v) => { setStrengths(v); saveDebounced({ strengths: v }); }} />
        <Field label="Schwächen" value={weaknesses} onChange={(v) => { setWeaknesses(v); saveDebounced({ weaknesses: v }); }} />
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

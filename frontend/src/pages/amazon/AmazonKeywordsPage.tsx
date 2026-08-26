import { useEffect, useMemo, useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAmazonProducts } from '../../hooks/amazon/useAmazonProducts';
import { useKeywords, useDeleteKeyword } from '../../hooks/amazon/useKeywords';
import type { Keyword, KeywordTargetField } from '../../api/amazon.keywords.api';
import { KeywordRow } from '../../components/amazon/keywords/KeywordRow';
import { TARGET_FIELD_GROUPS, TARGET_FIELD_LABEL, KEYWORDS_ACCENT } from '../../components/amazon/keywords/targetFields';

const LAST_PRODUCT_KEY = 'amazon.keywords.lastProduct';

const inputStyle: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

export function AmazonKeywordsPage() {
  const products = useAmazonProducts(false);
  const [productId, setProductId] = useState<number>(0);

  // Zuletzt gewähltes Produkt merken; sonst erstes.
  useEffect(() => {
    if (!products.data || products.data.length === 0) return;
    if (productId > 0 && products.data.some(p => p.id === productId)) return;
    const stored = Number(window.localStorage.getItem(LAST_PRODUCT_KEY) || 0);
    const pick = products.data.find(p => p.id === stored)?.id ?? products.data[0].id;
    setProductId(pick);
  }, [products.data]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseProduct(id: number) {
    setProductId(id);
    try { window.localStorage.setItem(LAST_PRODUCT_KEY, String(id)); } catch { /* ignore */ }
  }

  const { data: keywords, isLoading } = useKeywords(productId);
  const del = useDeleteKeyword(productId);

  // Filter
  const [search, setSearch] = useState('');
  const [onlyMain, setOnlyMain] = useState(false);
  const [minVol, setMinVol] = useState('');

  const filtered = useMemo(() => {
    const min = minVol.trim() === '' ? null : Math.max(0, Math.trunc(Number(minVol) || 0));
    const q = search.trim().toLowerCase();
    return (keywords ?? []).filter(k => {
      if (onlyMain && !k.is_main) return false;
      if (q && !k.phrase.toLowerCase().includes(q)) return false;
      if (min !== null && (k.search_volume ?? 0) < min) return false;
      return true;
    });
  }, [keywords, search, onlyMain, minVol]);

  const grouped = useMemo(() => {
    const map = new Map<KeywordTargetField, Keyword[]>();
    for (const tf of TARGET_FIELD_GROUPS) map.set(tf, []);
    for (const k of filtered) map.get(k.target_field)?.push(k);
    return map;
  }, [filtered]);

  return (
    <PageWrapper>
      <div className="mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
          <span className="material-symbols-outlined" style={{ color: KEYWORDS_ACCENT }}>manage_search</span>
          Keyword-Recherche
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
          Produkt wählen, Haupt-Keywords filtern und je Listing-Feld die zugewiesenen Keywords kopieren.
        </p>
      </div>

      {/* Produkt-Auswahl */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Produkt</label>
        <select
          value={productId || ''}
          onChange={(e) => chooseProduct(Number(e.target.value))}
          className="rounded-md px-3 py-2 text-sm min-w-[220px]" style={inputStyle}
        >
          {(products.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {productId > 0 && (
        <>
          {/* Filter */}
          <div className="flex flex-wrap items-center gap-3 mb-4 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Suchen …" spellCheck={false}
              className="rounded-md px-3 py-1.5 text-sm flex-1 min-w-[160px]" style={inputStyle}
            />
            <label className="flex items-center gap-1.5 text-sm cursor-pointer" style={{ color: 'var(--color-on-surface-variant)' }}>
              <input type="checkbox" checked={onlyMain} onChange={(e) => setOnlyMain(e.target.checked)} />
              nur ★ Haupt
            </label>
            <label className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              Min. Suchvolumen
              <input
                type="text" inputMode="numeric" value={minVol}
                onChange={(e) => setMinVol(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="—" className="rounded px-2 py-1 text-sm w-20 text-right tabular-nums" style={inputStyle}
              />
            </label>
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{filtered.length} / {keywords?.length ?? 0}</span>
          </div>

          {isLoading && <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Lade Keywords …</p>}
          {!isLoading && (keywords?.length ?? 0) === 0 && (
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              Für dieses Produkt gibt es noch keine Keywords. Auf der Produkt-Detailseite unter „Keyword-Recherche" welche anlegen.
            </p>
          )}

          {/* Gruppen je Ziel-Feld */}
          {!isLoading && (keywords?.length ?? 0) > 0 && (
            <div className="flex flex-col gap-4">
              {TARGET_FIELD_GROUPS.map(tf => {
                const items = grouped.get(tf) ?? [];
                if (items.length === 0) return null;
                return <FieldGroup key={tf || 'none'} productId={productId} field={tf} items={items} onDelete={(k) => { if (confirm(`Keyword „${k.phrase}" löschen?`)) del.mutate(k.id); }} />;
              })}
            </div>
          )}
        </>
      )}
    </PageWrapper>
  );
}

function FieldGroup({ productId, field, items, onDelete }: {
  productId: number; field: KeywordTargetField; items: Keyword[]; onDelete: (k: Keyword) => void;
}) {
  const [copied, setCopied] = useState(false);
  const accent = field === '' ? 'var(--color-on-surface-variant)' : KEYWORDS_ACCENT;

  async function copyAll() {
    const text = items.map(k => k.phrase).join(' ');
    if (!text.trim()) return;
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  }

  return (
    <div className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <h2 className="font-semibold flex items-center gap-2" style={{ color: accent }}>
          {TARGET_FIELD_LABEL[field]}
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-on-surface-variant)' }}>{items.length}</span>
        </h2>
        {field !== '' && (
          <button
            type="button" onClick={copyAll}
            title="Alle Keywords dieses Feldes kopieren (leerzeichen-getrennt)"
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
            style={{ background: `${KEYWORDS_ACCENT}22`, color: copied ? '#5cfd80' : KEYWORDS_ACCENT, border: `1px solid ${KEYWORDS_ACCENT}55` }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Kopiert' : 'Kopieren'}
          </button>
        )}
      </div>
      <div className="px-2 py-1">
        {items.map(k => (
          <KeywordRow key={k.id} productId={productId} keyword={k} onDelete={() => onDelete(k)} />
        ))}
      </div>
    </div>
  );
}

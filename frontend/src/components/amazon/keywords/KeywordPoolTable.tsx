import { useMemo, useState } from 'react';
import { useKeywords, useAddKeyword, useAddKeywordsBulk, useDeleteKeyword } from '../../../hooks/amazon/useKeywords';
import type { Keyword } from '../../../api/amazon.keywords.api';
import { KEYWORDS_ACCENT } from './targetFields';
import { KeywordRow } from './KeywordRow';

type SortKey = 'default' | 'phrase' | 'search_volume';

export function KeywordPoolTable({ productId }: { productId: number }) {
  const { data, isLoading } = useKeywords(productId);
  const addOne = useAddKeyword(productId);
  const addBulk = useAddKeywordsBulk(productId);
  const del = useDeleteKeyword(productId);

  const [single, setSingle] = useState('');
  const [bulk, setBulk] = useState('');
  const [showBulk, setShowBulk] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  const keywords = data ?? [];

  const sorted = useMemo(() => {
    if (sort === 'default') return keywords;
    const arr = [...keywords];
    arr.sort((a, b) => {
      let cmp: number;
      if (sort === 'phrase') cmp = a.phrase.localeCompare(b.phrase, 'de');
      else cmp = (a.search_volume ?? -1) - (b.search_volume ?? -1);
      return cmp * sortDir;
    });
    return arr;
  }, [keywords, sort, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sort) setSortDir(d => (d === 1 ? -1 : 1));
    else { setSort(key); setSortDir(key === 'search_volume' ? -1 : 1); }
  }

  function addSingle() {
    const p = single.trim();
    if (!p) return;
    addOne.mutate({ phrase: p, source: 'manuell' });
    setSingle('');
  }
  async function insertBulk() {
    const text = bulk.trim();
    if (!text) return;
    const res = await addBulk.mutateAsync({ text, source: 'manuell' });
    setBulk('');
    setBulkMsg(res.added > 0 ? `${res.added} Keyword(s) hinzugefügt.` : 'Keine neuen Keywords (alles Dubletten).');
    window.setTimeout(() => setBulkMsg(null), 3000);
  }

  const sortIcon = (key: SortKey) => (sort !== key ? 'unfold_more' : sortDir === 1 ? 'arrow_upward' : 'arrow_downward');

  return (
    <div>
      {/* Eingabe */}
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text" value={single}
          onChange={(e) => setSingle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSingle(); } }}
          placeholder="Keyword hinzufügen und Enter …"
          spellCheck={false}
          className="flex-1 rounded-md px-3 py-2 text-sm"
          style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <button
          type="button" onClick={() => setShowBulk(v => !v)}
          className="flex items-center gap-1 text-xs px-3 py-2 rounded-md"
          style={{ background: showBulk ? `${KEYWORDS_ACCENT}22` : 'rgba(255,255,255,0.06)', color: showBulk ? KEYWORDS_ACCENT : 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>playlist_add</span>
          Mehrere einfügen
        </button>
      </div>
      {showBulk && (
        <div className="mb-3">
          <textarea
            value={bulk} onChange={(e) => setBulk(e.target.value)} rows={4}
            placeholder="Mehrere Keywords einfügen — ein Keyword pro Zeile (Dubletten werden automatisch entfernt)"
            spellCheck={false}
            className="w-full rounded-md px-3 py-2 text-sm resize-y"
            style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', lineHeight: '1.5' }}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs" style={{ color: KEYWORDS_ACCENT }}>{bulkMsg}</span>
            <button
              type="button" onClick={insertBulk} disabled={addBulk.isPending || !bulk.trim()}
              className="text-xs px-3 py-1.5 rounded-md disabled:opacity-50"
              style={{ background: KEYWORDS_ACCENT, color: '#06231f' }}
            >
              Hinzufügen
            </button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Lade Keywords …</p>}
      {!isLoading && keywords.length === 0 && (
        <p className="text-sm py-2" style={{ color: 'var(--color-on-surface-variant)' }}>
          Noch keine Keywords. Oben eintragen, aus einer Quelle einfügen, oder „Claude-Prompt" nutzen.
        </p>
      )}

      {keywords.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Kopfzeile */}
          <div
            className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium"
            style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--color-on-surface-variant)' }}
          >
            <span style={{ width: '28px' }} className="text-center">★</span>
            <button type="button" onClick={() => toggleSort('phrase')} className="flex items-center gap-0.5 flex-1 text-left">
              Keyword <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{sortIcon('phrase')}</span>
            </button>
            <button type="button" onClick={() => toggleSort('search_volume')} className="flex items-center gap-0.5" style={{ width: '110px' }}>
              Suchvolumen <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{sortIcon('search_volume')}</span>
            </button>
            <span style={{ width: '120px' }}>Quelle</span>
            <span style={{ width: '130px' }}>Ziel-Feld</span>
            <span style={{ width: '28px' }} />
          </div>
          {sorted.map((k: Keyword) => (
            <KeywordRow
              key={k.id}
              productId={productId}
              keyword={k}
              onDelete={() => { if (confirm(`Keyword „${k.phrase}" löschen?`)) del.mutate(k.id); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

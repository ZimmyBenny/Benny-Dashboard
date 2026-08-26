import { useEffect, useState } from 'react';
import {
  useKeywordSources, useCreateKeywordSource, useImportCompetitorsAsSources,
  useUpdateKeywordSource, useDeleteKeywordSource, useAddKeywordsBulk,
} from '../../../hooks/amazon/useKeywords';
import type { KeywordSource } from '../../../api/amazon.keywords.api';
import { KEYWORDS_ACCENT } from './targetFields';

const inputStyle: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily: 'inherit',
};

export function KeywordSourcesTable({ productId }: { productId: number }) {
  const { data, isLoading } = useKeywordSources(productId);
  const create = useCreateKeywordSource(productId);
  const importC = useImportCompetitorsAsSources(productId);
  const del = useDeleteKeywordSource(productId);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  async function runImport() {
    const res = await importC.mutateAsync();
    setImportMsg(res.added > 0 ? `${res.added} Quelle(n) aus Mitbewerbern übernommen.` : 'Keine neuen ASINs zu übernehmen.');
    window.setTimeout(() => setImportMsg(null), 3000);
  }

  const sources = data ?? [];

  return (
    <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>Quellen (Konkurrenz)</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={runImport}
            disabled={importC.isPending}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>download</span>
            Aus Mitbewerbern übernehmen
          </button>
          <button
            type="button"
            onClick={() => create.mutate()}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
            style={{ background: `${KEYWORDS_ACCENT}22`, color: KEYWORDS_ACCENT, border: `1px solid ${KEYWORDS_ACCENT}55` }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span>
            Quelle
          </button>
        </div>
      </div>
      {importMsg && <p className="text-xs mb-2" style={{ color: KEYWORDS_ACCENT }}>{importMsg}</p>}

      {isLoading && <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Lade Quellen …</p>}
      {!isLoading && sources.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
          Noch keine Quellen. „Aus Mitbewerbern übernehmen" zieht deine ASINs/Links, oder „+ Quelle" für eine leere Zeile.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {sources.map(s => (
          <SourceRow
            key={s.id}
            productId={productId}
            source={s}
            onDelete={() => { if (confirm(`Quelle „${s.asin || 'ohne ASIN'}" löschen?`)) del.mutate(s.id); }}
          />
        ))}
      </div>
    </div>
  );
}

function SourceRow({ productId, source, onDelete }: { productId: number; source: KeywordSource; onDelete: () => void }) {
  const update = useUpdateKeywordSource(productId);
  const addBulk = useAddKeywordsBulk(productId);
  const [asin, setAsin] = useState(source.asin);
  const [url, setUrl] = useState(source.url);
  const [revenue, setRevenue] = useState(source.revenue);
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);

  useEffect(() => { setAsin(source.asin); setUrl(source.url); setRevenue(source.revenue); }, [source.asin, source.url, source.revenue]);

  function commit(field: 'asin' | 'url' | 'revenue', value: string, original: string) {
    if (value === original) return;
    update.mutate({ sid: source.id, patch: { [field]: value } });
  }

  async function insertKeywords() {
    const text = paste.trim();
    if (!text) return;
    const res = await addBulk.mutateAsync({ text, source: asin.trim() || 'Quelle' });
    setPaste('');
    setPasteMsg(res.added > 0 ? `${res.added} Keyword(s) in den Pool übernommen.` : 'Keine neuen Keywords (alles Dubletten).');
    window.setTimeout(() => setPasteMsg(null), 3000);
  }

  return (
    <div className="rounded-md p-2" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2">
        <input
          type="text" value={asin} placeholder="ASIN"
          onChange={(e) => setAsin(e.target.value)} onBlur={() => commit('asin', asin, source.asin)}
          spellCheck={false}
          className="rounded px-2 py-1 text-sm" style={{ ...inputStyle, width: '130px' }}
        />
        <input
          type="text" value={url} placeholder="Link"
          onChange={(e) => setUrl(e.target.value)} onBlur={() => commit('url', url, source.url)}
          spellCheck={false}
          className="rounded px-2 py-1 text-sm flex-1 min-w-0" style={inputStyle}
        />
        <input
          type="text" value={revenue} placeholder="Umsatz"
          onChange={(e) => setRevenue(e.target.value)} onBlur={() => commit('revenue', revenue, source.revenue)}
          spellCheck={false}
          className="rounded px-2 py-1 text-sm" style={{ ...inputStyle, width: '130px' }}
        />
        <button
          type="button" title="Keywords zu dieser Quelle einfügen"
          onClick={() => setShowPaste(v => !v)}
          className="flex items-center justify-center rounded px-2 py-1"
          style={{ background: showPaste ? `${KEYWORDS_ACCENT}22` : 'rgba(255,255,255,0.06)', color: showPaste ? KEYWORDS_ACCENT : 'var(--color-on-surface-variant)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>playlist_add</span>
        </button>
        <button type="button" onClick={onDelete} aria-label="Quelle löschen" className="flex items-center justify-center rounded px-1">
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#f87171' }}>delete</span>
        </button>
      </div>
      {showPaste && (
        <div className="mt-2">
          <textarea
            value={paste} onChange={(e) => setPaste(e.target.value)} rows={3}
            placeholder="Gefundene Keywords dieser Quelle einfügen — ein Keyword pro Zeile"
            spellCheck={false}
            className="w-full rounded px-2 py-1 text-sm resize-y" style={{ ...inputStyle, lineHeight: '1.5' }}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs" style={{ color: KEYWORDS_ACCENT }}>{pasteMsg}</span>
            <button
              type="button" onClick={insertKeywords} disabled={addBulk.isPending || !paste.trim()}
              className="text-xs px-3 py-1 rounded-md disabled:opacity-50"
              style={{ background: KEYWORDS_ACCENT, color: '#06231f' }}
            >
              In Pool übernehmen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

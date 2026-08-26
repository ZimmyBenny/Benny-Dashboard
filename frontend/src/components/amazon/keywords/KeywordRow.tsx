import { useEffect, useState } from 'react';
import { useUpdateKeyword } from '../../../hooks/amazon/useKeywords';
import type { Keyword, KeywordTargetField } from '../../../api/amazon.keywords.api';
import { TARGET_FIELD_OPTIONS, KEYWORDS_ACCENT } from './targetFields';

const cellInput: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
  fontFamily: 'inherit',
};

// Eine editierbare Keyword-Zeile — geteilt zwischen Produkt-Pool und Hauptseite.
export function KeywordRow({ productId, keyword, onDelete }: { productId: number; keyword: Keyword; onDelete: () => void }) {
  const update = useUpdateKeyword(productId);
  const [phrase, setPhrase] = useState(keyword.phrase);
  const [volume, setVolume] = useState(keyword.search_volume == null ? '' : String(keyword.search_volume));
  const [source, setSource] = useState(keyword.source);

  useEffect(() => {
    setPhrase(keyword.phrase);
    setVolume(keyword.search_volume == null ? '' : String(keyword.search_volume));
    setSource(keyword.source);
  }, [keyword.phrase, keyword.search_volume, keyword.source]);

  function commitPhrase() {
    const p = phrase.trim();
    if (!p || p === keyword.phrase) { setPhrase(keyword.phrase); return; }
    update.mutate({ kid: keyword.id, patch: { phrase: p } });
  }
  function commitVolume() {
    const raw = volume.trim();
    const next = raw === '' ? null : Math.max(0, Math.trunc(Number(raw) || 0));
    if (next === keyword.search_volume) return;
    update.mutate({ kid: keyword.id, patch: { search_volume: next } });
  }
  function commitSource() {
    if (source === keyword.source) return;
    update.mutate({ kid: keyword.id, patch: { source } });
  }
  function toggleMain() {
    update.mutate({ kid: keyword.id, patch: { is_main: keyword.is_main ? 0 : 1 } });
  }
  function setTarget(tf: KeywordTargetField) {
    update.mutate({ kid: keyword.id, patch: { target_field: tf } });
  }

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5"
      style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
    >
      <button
        type="button" onClick={toggleMain}
        title={keyword.is_main ? 'Haupt-Keyword — abwählen' : 'Als Haupt-Keyword markieren'}
        style={{ width: '28px' }} className="flex items-center justify-center"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: keyword.is_main ? '#fbbf24' : 'var(--color-on-surface-variant)', fontVariationSettings: keyword.is_main ? "'FILL' 1" : "'FILL' 0" }}>star</span>
      </button>
      <input
        type="text" value={phrase}
        onChange={(e) => setPhrase(e.target.value)} onBlur={commitPhrase}
        spellCheck={false}
        className="flex-1 min-w-0 rounded px-2 py-1 text-sm" style={cellInput}
      />
      <input
        type="text" inputMode="numeric" value={volume}
        onChange={(e) => setVolume(e.target.value.replace(/[^\d]/g, ''))} onBlur={commitVolume}
        placeholder="—"
        className="rounded px-2 py-1 text-sm text-right tabular-nums" style={{ ...cellInput, width: '110px' }}
      />
      <input
        type="text" value={source}
        onChange={(e) => setSource(e.target.value)} onBlur={commitSource}
        placeholder="Quelle" spellCheck={false}
        className="rounded px-2 py-1 text-xs" style={{ ...cellInput, width: '120px' }}
      />
      <select
        value={keyword.target_field}
        onChange={(e) => setTarget(e.target.value as KeywordTargetField)}
        className="rounded px-1 py-1 text-xs" style={{ ...cellInput, width: '130px', color: keyword.target_field ? KEYWORDS_ACCENT : 'var(--color-on-surface-variant)' }}
      >
        {TARGET_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <button type="button" onClick={onDelete} aria-label="Keyword löschen" style={{ width: '28px' }} className="flex items-center justify-center">
        <span className="material-symbols-outlined" style={{ fontSize: '17px', color: '#f87171' }}>delete</span>
      </button>
    </div>
  );
}

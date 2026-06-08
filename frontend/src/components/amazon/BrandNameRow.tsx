import { useEffect, useState } from 'react';
import { type BrandCandidate, type CandidatePatch } from '../../api/amazon.api';
import { useUpdateCandidate } from '../../hooks/amazon/useBrand';

interface Props {
  productId: number;
  candidate: BrandCandidate;
  rowNumber: number;
  onRequestDelete: (c: BrandCandidate) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

type StatusFlag = 'is_interesting' | 'is_favorite' | 'is_archived';

export function BrandNameRow({ productId, candidate, rowNumber, onRequestDelete }: Props) {
  const update = useUpdateCandidate(productId);

  const [name, setName] = useState(candidate.name);
  const [remarks, setRemarks] = useState(candidate.remarks ?? '');

  useEffect(() => { setName(candidate.name); }, [candidate.name]);
  useEffect(() => { setRemarks(candidate.remarks ?? ''); }, [candidate.remarks]);

  function patch(p: CandidatePatch) {
    update.mutate({ candidateId: candidate.id, patch: p });
  }

  function saveName() {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === candidate.name) {
      setName(candidate.name);
      return;
    }
    patch({ name: trimmed });
  }

  function saveRemarks() {
    const trimmed = remarks.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === candidate.remarks) return;
    patch({ remarks: next });
  }

  // Status ist exklusiv: nur einer von 'is_interesting' | 'is_favorite' | 'is_archived' kann aktiv sein.
  function toggleStatus(field: StatusFlag) {
    const isAlreadyActive = candidate[field] === 1;
    if (isAlreadyActive) {
      // Klick auf bereits aktiven → ausschalten
      patch({ [field]: 0 } as CandidatePatch);
      return;
    }
    // Setze den geklickten, deaktiviere die anderen beiden
    const others: StatusFlag[] = (['is_interesting', 'is_favorite', 'is_archived'] as StatusFlag[]).filter(f => f !== field);
    const partial: CandidatePatch = { [field]: 1 } as CandidatePatch;
    for (const o of others) {
      if (candidate[o] === 1) (partial as Record<string, 0 | 1>)[o] = 0;
    }
    patch(partial);
  }

  function setRanking(n: 1 | 2 | 3) {
    const next: number | null = candidate.ranking === n ? null : n;
    patch({ ranking: next });
  }

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: candidate.is_archived === 1 ? 0.55 : 1 }}>
      <td className="p-2 text-right tabular-nums text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
        {rowNumber}
      </td>
      <td className="p-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          maxLength={200}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={candidate.is_interesting === 1}
          onChange={() => toggleStatus('is_interesting')}
          className="w-4 h-4"
          style={{ accentColor: 'var(--color-primary)' }}
          aria-label="Interessant"
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={candidate.is_favorite === 1}
          onChange={() => toggleStatus('is_favorite')}
          className="w-4 h-4"
          style={{ accentColor: '#fbbf24' }}
          aria-label="Favourit"
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={candidate.is_archived === 1}
          onChange={() => toggleStatus('is_archived')}
          className="w-4 h-4"
          style={{ accentColor: '#fdba74' }}
          aria-label="Archiv"
        />
      </td>
      <td className="p-2 text-center">
        <button
          type="button"
          onClick={() => patch({ is_final: candidate.is_final === 1 ? 0 : 1 })}
          aria-label="Finale Marke"
          title={candidate.is_final === 1 ? 'Finale Marke (klicken zum Entfernen)' : 'Als finale Marke markieren'}
          className="p-1 rounded"
        >
          <span className="material-symbols-outlined" style={{
            fontSize: '18px',
            color: candidate.is_final === 1 ? '#fbbf24' : 'rgba(255,255,255,0.25)',
            fontVariationSettings: candidate.is_final === 1 ? '"FILL" 1' : '"FILL" 0',
          }}>workspace_premium</span>
        </button>
      </td>
      <td className="p-2">
        <div className="flex items-center justify-center gap-0.5">
          {[1, 2, 3].map(n => {
            const active = candidate.ranking !== null && candidate.ranking !== undefined && n <= candidate.ranking;
            return (
              <button
                key={n}
                type="button"
                aria-label={`Ranking ${n}`}
                onClick={() => setRanking(n as 1 | 2 | 3)}
                className="w-5 h-5 flex items-center justify-center"
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '18px',
                    color: active ? '#fbbf24' : 'rgba(255,255,255,0.25)',
                    fontVariationSettings: active ? '"FILL" 1' : '"FILL" 0',
                  }}
                >
                  star
                </span>
              </button>
            );
          })}
        </div>
      </td>
      <td className="p-2">
        <input
          type="text"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          onBlur={saveRemarks}
          maxLength={300}
          placeholder="Bemerkungen"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>
      <td className="p-2 text-right">
        <button
          type="button"
          onClick={() => onRequestDelete(candidate)}
          aria-label="Markenname löschen"
          className="p-1 rounded hover:bg-white/5"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#fca5a5' }}>delete</span>
        </button>
      </td>
    </tr>
  );
}

import { useEffect, useState } from 'react';
import { type BrandCandidate, type CandidatePatch } from '../../api/amazon.api';
import { useUpdateCandidate } from '../../hooks/amazon/useBrand';

interface Props {
  productId: number;
  candidate: BrandCandidate;
  onRequestDelete: (c: BrandCandidate) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function BrandNameRow({ productId, candidate, onRequestDelete }: Props) {
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

  function toggle(field: 'is_interesting' | 'is_maybe' | 'is_no' | 'is_favorite' | 'is_archived', current: 0 | 1) {
    patch({ [field]: current === 1 ? 0 : 1 } as CandidatePatch);
  }

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: candidate.is_archived === 1 ? 0.55 : 1 }}>
      <td className="p-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          maxLength={200}
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>
      {(['is_interesting', 'is_maybe', 'is_no', 'is_favorite'] as const).map(field => (
        <td key={field} className="p-2 text-center">
          <input
            type="checkbox"
            checked={candidate[field] === 1}
            onChange={() => toggle(field, candidate[field] as 0 | 1)}
            className="w-4 h-4"
            style={{ accentColor: field === 'is_favorite' ? '#fbbf24' : 'var(--color-primary)' }}
            aria-label={field}
          />
        </td>
      ))}
      <td className="p-2">
        <input
          type="text"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          onBlur={saveRemarks}
          maxLength={300}
          placeholder="Bemerkungen"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={candidate.is_archived === 1}
          onChange={() => toggle('is_archived', candidate.is_archived as 0 | 1)}
          className="w-4 h-4"
          style={{ accentColor: '#fdba74' }}
          aria-label="archiviert"
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

import { useEffect, useState } from 'react';
import { type BrandCandidate, type CandidatePatch, type ResearchStatus } from '../../api/amazon.api';
import { useUpdateCandidate } from '../../hooks/amazon/useBrand';

const STATUS_LABEL: Record<ResearchStatus, string> = {
  frei: 'frei', belegt: 'belegt', unklar: 'unklar',
};
const STATUS_COLOR: Record<ResearchStatus, string> = {
  frei: '#34d399',
  belegt: '#fca5a5',
  unklar: '#fdba74',
};
const ORDER: ResearchStatus[] = ['frei', 'belegt', 'unklar'];

interface Props {
  productId: number;
  candidate: BrandCandidate;
}

const ACCENT = '#f472b6';

function StatusPills({
  value,
  onChange,
}: { value: ResearchStatus | null; onChange: (next: ResearchStatus | null) => void }) {
  return (
    <div className="flex gap-1">
      {ORDER.map(s => {
        const active = value === s;
        const color = STATUS_COLOR[s];
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(active ? null : s)}
            className="px-2.5 py-1 rounded-full text-xs"
            style={{
              background: active ? `${color}33` : 'transparent',
              color: active ? color : 'var(--color-on-surface-variant)',
              border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
            }}
          >
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

export function BrandFavoriteCard({ productId, candidate }: Props) {
  const update = useUpdateCandidate(productId);

  const [url, setUrl] = useState(candidate.research_url ?? '');
  const [notes, setNotes] = useState(candidate.research_notes ?? '');

  useEffect(() => { setUrl(candidate.research_url ?? ''); }, [candidate.research_url]);
  useEffect(() => { setNotes(candidate.research_notes ?? ''); }, [candidate.research_notes]);

  function patch(p: CandidatePatch) {
    update.mutate({ candidateId: candidate.id, patch: p });
  }

  function saveUrl() {
    const trimmed = url.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === candidate.research_url) return;
    patch({ research_url: next });
  }

  function saveNotes() {
    const trimmed = notes.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === candidate.research_notes) return;
    patch({ research_notes: next });
  }

  const fields: Array<{ label: string; key: keyof CandidatePatch; current: ResearchStatus | null }> = [
    { label: 'Markenrecht',  key: 'trademark_status',   current: candidate.trademark_status },
    { label: '.shop Domain', key: 'domain_shop_status', current: candidate.domain_shop_status },
    { label: '.de Domain',   key: 'domain_de_status',   current: candidate.domain_de_status },
    { label: 'Social Media', key: 'social_status',      current: candidate.social_status },
    { label: 'TikTok',       key: 'tiktok_status',      current: candidate.tiktok_status },
    { label: 'Instagram',    key: 'instagram_status',   current: candidate.instagram_status },
  ];

  return (
    <article
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        background: 'var(--color-surface-container)',
        border: `1px solid ${ACCENT}26`,
      }}
    >
      <header className="flex items-center gap-2">
        <span className="material-symbols-outlined" style={{ color: ACCENT, fontSize: '18px' }}>star</span>
        <h4 className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>{candidate.name}</h4>
      </header>

      <div className="grid gap-2 sm:grid-cols-[140px_1fr] items-center">
        {fields.map(f => (
          <div key={f.key} className="contents">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{f.label}</span>
            <StatusPills
              value={f.current}
              onChange={(next) => patch({ [f.key]: next } as CandidatePatch)}
            />
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Recherche-URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={saveUrl}
          maxLength={500}
          placeholder="https://…"
          className="w-full px-2 py-1 rounded text-sm"
          style={{
            background: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Notizen</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          maxLength={2000}
          className="w-full px-2 py-1 rounded text-sm resize-y"
          style={{
            background: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        />
      </label>
    </article>
  );
}

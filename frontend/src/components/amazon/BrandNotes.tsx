import { useEffect, useState } from 'react';
import { useUpdateBrand } from '../../hooks/amazon/useBrand';

interface Props {
  productId: number;
  notes: string | null;
}

export function BrandNotes({ productId, notes }: Props) {
  const update = useUpdateBrand(productId);
  const [local, setLocal] = useState(notes ?? '');

  useEffect(() => { setLocal(notes ?? ''); }, [notes]);

  function save() {
    const trimmed = local.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === notes) return;
    update.mutate({ notes: next });
  }

  return (
    <div className="px-5 pb-3">
      <label className="text-sm font-semibold mb-2 block" style={{ color: 'var(--color-on-surface)' }}>
        Notizen
      </label>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={save}
        rows={4}
        maxLength={2000}
        placeholder="Allgemeine Notizen zur Markennamen-Findung …"
        className="w-full px-3 py-2 rounded-md text-sm resize-y"
        style={{
          background: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
    </div>
  );
}

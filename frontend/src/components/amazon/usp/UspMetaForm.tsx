import { useEffect, useState } from 'react';
import { type UspMeta } from '../../../api/amazon.api';
import { useUpdateUspMeta } from '../../../hooks/amazon/useUsp';

function Field({ label, value, onSave, textarea }: { label: string; value: string; onSave: (v: string) => void; textarea?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const common = {
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: () => { if (v !== value) onSave(v); },
    className: 'w-full px-2 py-1.5 rounded-md text-sm',
    style: { background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' },
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      {textarea ? <textarea rows={2} {...common} /> : <input {...common} />}
    </label>
  );
}

export function UspMetaForm({ productId, meta }: { productId: number; meta: UspMeta }) {
  const update = useUpdateUspMeta(productId);
  return (
    <div className="flex flex-col gap-3 mb-4">
      <Field label="Marke" value={meta.marke ?? ''} onSave={(marke) => update.mutate({ marke })} />
      <Field label="Hauptfokus" value={meta.hauptfokus ?? ''} onSave={(hauptfokus) => update.mutate({ hauptfokus })} textarea />
    </div>
  );
}

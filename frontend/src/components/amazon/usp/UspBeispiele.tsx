import { useEffect, useState } from 'react';
import { type UspMeta } from '../../../api/amazon.api';
import { useUpdateUspMeta } from '../../../hooks/amazon/useUsp';

function Field({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <textarea rows={2} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v); }}
        className="w-full px-2 py-1.5 rounded-md text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
    </label>
  );
}

export function UspBeispiele({ productId, meta }: { productId: number; meta: UspMeta }) {
  const update = useUpdateUspMeta(productId);
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Beispiele & Links</span>
      <Field label="Amazon USP Beispiel" value={meta.bsp_amazon ?? ''} onSave={(v) => update.mutate({ bsp_amazon: v })} />
      <Field label="Alibaba USP Beispiel" value={meta.bsp_alibaba ?? ''} onSave={(v) => update.mutate({ bsp_alibaba: v })} />
      <Field label="Pinterest USP Beispiel" value={meta.bsp_pinterest ?? ''} onSave={(v) => update.mutate({ bsp_pinterest: v })} />
      <Field label="Bedeutungsvolle Differenzierung" value={meta.differenzierung ?? ''} onSave={(v) => update.mutate({ differenzierung: v })} />
    </div>
  );
}

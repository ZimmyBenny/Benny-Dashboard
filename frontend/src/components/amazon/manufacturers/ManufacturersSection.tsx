import { useRef, useState } from 'react';
import { type Manufacturer } from '../../../api/amazon.api';
import {
  useManufacturers,
  useCreateManufacturer,
  useDeleteManufacturer,
  useReorderManufacturers,
  useUpdateManufacturerSettings,
  parsePreis,
} from '../../../hooks/amazon/useManufacturers';
import { SectionHeader } from '../SectionHeader';
import { ManufacturerCard } from './ManufacturerCard';
import { ManufacturerComparison } from './ManufacturerComparison';

const ACCENT = '#34d399'; // emerald-400

interface DeleteDialogProps {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}

function DeleteManufacturerDialog({ name, onConfirm, onClose }: DeleteDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-5 w-[90%] max-w-sm"
        style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4" style={{ color: 'var(--color-on-surface)' }}>
          Hersteller „{name || 'Hersteller'}" wird dauerhaft gelöscht.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(); onClose(); }}
            className="px-3 py-1.5 rounded-md text-sm"
            style={{ background: '#7f1d1d', color: '#fecaca' }}
          >
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  productId: number;
}

export function ManufacturersSection({ productId }: Props) {
  const { data, isLoading, isError, refetch } = useManufacturers(productId);
  const create = useCreateManufacturer(productId);
  const del = useDeleteManufacturer(productId);
  const reorder = useReorderManufacturers(productId);
  const updateSettings = useUpdateManufacturerSettings(productId);
  const [rateInput, setRateInput] = useState<string | null>(null);

  const [expanded, setExpanded] = useState(true);
  const [order, setOrder] = useState<number[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Manufacturer | null>(null);
  const dragIndex = useRef<number | null>(null);

  if (isLoading) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Hersteller …</p>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>Hersteller konnten nicht geladen werden.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          Erneut laden
        </button>
      </section>
    );
  }

  const { manufacturers } = data;
  const rateValue = rateInput ?? (data.settings.usd_eur_rate ?? '');
  const rate = parsePreis(data.settings.usd_eur_rate);

  const ids = order ?? manufacturers.map(m => m.id);
  const byId = new Map(manufacturers.map(m => [m.id, m]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as Manufacturer[];

  function down(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragIndex.current = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!order) setOrder(manufacturers.map(m => m.id));
  }

  function enter(idx: number) {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    setOrder(prev => {
      const arr = [...(prev ?? manufacturers.map(m => m.id))];
      const [moved] = arr.splice(dragIndex.current as number, 1);
      arr.splice(idx, 0, moved);
      dragIndex.current = idx;
      return arr;
    });
  }

  function up() {
    if (dragIndex.current !== null && order) reorder.mutate(order, { onSettled: () => setOrder(null) });
    dragIndex.current = null;
  }

  return (
    <section
      className="rounded-xl"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader
        icon="factory"
        title="Hersteller"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={() => setExpanded(e => !e)}
      />
      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>1 USD =</span>
            <input
              value={rateValue}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={() => { if (rateInput !== null && rateInput !== (data.settings.usd_eur_rate ?? '')) updateSettings.mutate(rateInput); setRateInput(null); }}
              placeholder="z. B. 0,92"
              className="px-2 py-1 rounded-md text-xs w-24"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>€</span>
          </div>
          {ordered.map((m, idx) => (
            <ManufacturerCard
              key={m.id}
              productId={productId}
              manufacturer={m}
              index={idx}
              onRequestDelete={setPendingDelete}
              dragHandleProps={{
                onPointerDown: (e) => down(idx, e),
                onPointerEnter: () => enter(idx),
                onPointerUp: up,
              }}
            />
          ))}
          <button
            type="button"
            onClick={() => create.mutate(undefined)}
            className="self-start px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>Hersteller hinzufügen
          </button>
          <ManufacturerComparison manufacturers={manufacturers} rate={rate} />
        </div>
      )}
      {pendingDelete && (
        <DeleteManufacturerDialog
          name={pendingDelete.name}
          onConfirm={() => del.mutate(pendingDelete.id)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}

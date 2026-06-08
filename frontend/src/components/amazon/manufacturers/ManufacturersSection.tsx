import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Manufacturer, fetchEurUsdRate } from '../../../api/amazon.api';
import {
  useManufacturers,
  useCreateManufacturer,
  useReorderManufacturers,
  useUpdateManufacturerSettings,
  parseRate,
  eurPreis,
} from '../../../hooks/amazon/useManufacturers';
import { SectionHeader } from '../SectionHeader';
import { ManufacturerComparison } from './ManufacturerComparison';

const ACCENT = '#34d399';

interface Props { productId: number; }

export function ManufacturersSection({ productId }: Props) {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useManufacturers(productId);
  const create = useCreateManufacturer(productId);
  const reorder = useReorderManufacturers(productId);
  const updateSettings = useUpdateManufacturerSettings(productId);

  const [expanded, setExpanded] = useState(true);
  const [order, setOrder] = useState<number[] | null>(null);
  const [rateInput, setRateInput] = useState<string | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState(false);
  const dragIndex = useRef<number | null>(null);

  if (isLoading) {
    return (
      <section className="rounded-xl p-5" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Hersteller …</p>
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section className="rounded-xl p-5" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>Hersteller konnten nicht geladen werden.</p>
        <button type="button" onClick={() => refetch()} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
      </section>
    );
  }

  const { manufacturers } = data;
  const rateValue = rateInput ?? (data.settings.usd_eur_rate ?? '');
  const rate = parseRate(data.settings.usd_eur_rate);

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

  async function holeAktuellenKurs() {
    setFxError(false); setFxLoading(true);
    try {
      const { rate, date } = await fetchEurUsdRate();
      await updateSettings.mutateAsync({ usdEurRate: String(rate), rateDate: date });
    } catch { setFxError(true); }
    finally { setFxLoading(false); }
  }

  function openManufacturer(mId: number) {
    navigate(`/amazon/entwicklung/products/${productId}/hersteller/${mId}`);
  }
  function cheapestEur(m: Manufacturer): string {
    const vals = m.offers.map(o => eurPreis(o, rate)).filter((n): n is number => n !== null);
    if (vals.length === 0) return '—';
    return Math.min(...vals).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader icon="factory" title="Hersteller" accent={ACCENT} expanded={expanded} onToggleExpand={() => setExpanded(e => !e)} />
      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>1 EUR =</span>
            <input
              value={rateValue}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={() => { if (rateInput !== null && rateInput !== (data.settings.usd_eur_rate ?? '')) updateSettings.mutate({ usdEurRate: rateInput }); setRateInput(null); }}
              placeholder="z. B. 1,15"
              className="px-2 py-1 rounded-md text-xs w-24"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>$</span>
            <button
              type="button"
              onClick={holeAktuellenKurs}
              disabled={fxLoading}
              className="px-2 py-1 rounded-md text-xs flex items-center gap-1"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', opacity: fxLoading ? 0.6 : 1 }}
              title="Aktuellen EZB-Kurs holen"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sync</span>{fxLoading ? 'Lädt …' : 'Aktuell holen'}
            </button>
            {data.settings.rate_date ? <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Stand: {data.settings.rate_date}</span> : null}
            {fxError ? <span className="text-xs" style={{ color: '#fca5a5' }}>Kurs nicht erreichbar (offline?)</span> : null}
          </div>

          <div className="flex flex-col gap-2">
            {ordered.map((m, idx) => (
              <div key={m.id} className="flex items-center gap-2 rounded-lg" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.10)', borderLeft: `3px solid ${ACCENT}` }}>
                <div
                  onPointerDown={(e) => down(idx, e)}
                  onPointerEnter={() => enter(idx)}
                  onPointerUp={up}
                  className="flex items-center justify-center rounded-md cursor-grab select-none flex-shrink-0 ml-2"
                  style={{ width: 26, height: 26, background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
                  title="Zum Sortieren ziehen"
                >
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{idx + 1}</span>
                </div>
                <button type="button" onClick={() => openManufacturer(m.id)} className="flex-1 flex items-center gap-3 text-left px-2 py-3 min-w-0">
                  <span className="font-semibold truncate" style={{ color: 'var(--color-on-surface)' }}>{m.name || 'Hersteller'}</span>
                  {m.ansprechpartner ? <span className="text-xs truncate" style={{ color: 'var(--color-on-surface-variant)' }}>{m.ansprechpartner}</span> : null}
                  <span className="ml-auto flex items-center gap-3 flex-shrink-0">
                    {m.offers.some(o => o.is_latest) ? <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fbbf24', fontVariationSettings: "'FILL' 1" }}>star</span> : null}
                    <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{m.offers.length} Angebot{m.offers.length === 1 ? '' : 'e'}</span>
                    <span className="text-xs font-medium" style={{ color: 'var(--color-on-surface)' }}>{cheapestEur(m)}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-surface-variant)' }}>chevron_right</span>
                  </span>
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => create.mutate(undefined, { onSuccess: (m) => openManufacturer(m.id) })}
            className="self-start px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>Hersteller hinzufügen
          </button>

          <ManufacturerComparison manufacturers={manufacturers} rate={rate} />
        </div>
      )}
    </section>
  );
}

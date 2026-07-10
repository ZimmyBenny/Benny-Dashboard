import { useEffect, useMemo, useRef, useState } from 'react';
import { SectionHeader } from '../SectionHeader';
import { useSectionExpanded } from '../../../hooks/amazon/useSectionExpanded';
import {
  useAmazonPackaging, useSavePackaging, useSetPackagingFinal, useSetPackagingCheck,
  useCreatePackagingItem, useDeletePackagingItem, useSaveGpsr,
} from '../../../hooks/amazon/useAmazonPackaging';
import { useManufacturers } from '../../../hooks/amazon/useManufacturers';
import { downloadPackagingBriefing, type PackagingCheckItem, type PackagingPatch } from '../../../api/amazon.api';

interface Props {
  productId: number;
  productName: string;
}

const OBERPUNKT_ACCENT = 'var(--color-primary)';
const SEVERITY_COLORS: Record<PackagingCheckItem['severity'], string> = {
  pflicht: '#ff6b6b',
  empfohlen: '#f5a524',
  optional: '#4ade80',
};
const SEVERITY_LABELS: Record<PackagingCheckItem['severity'], string> = {
  pflicht: 'Pflicht',
  empfohlen: 'Empfohlen',
  optional: 'Optional',
};

// ── Deutsches Zahlenformat (Komma statt Punkt) ──
function fmtDe(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
function parseDe(raw: string): number | null {
  const t = raw.trim().replace(/\./g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ── Größenklassen-Logik (identisch zum Backend) ──
type SizeClass = 'Standard' | 'Oversize' | 'Special Oversize' | null;
function computeSizeClass(w: number | null, h: number | null, d: number | null, weightKg: number | null): SizeClass {
  if (w == null || h == null || d == null || weightKg == null) return null;
  const dims = [w, h, d].sort((a, b) => b - a);
  const isStandard = dims[0] <= 45.72 && dims[1] <= 35.56 && dims[2] <= 20.32 && weightKg <= 9.07;
  if (isStandard) return 'Standard';
  if (weightKg <= 68) return 'Oversize';
  return 'Special Oversize';
}

// ── Numerisches Input mit deutschem Komma + onBlur-Autosave ──
function NumberField({ label, value, onCommit, suffix }: {
  label: string; value: number | null; onCommit: (n: number | null) => void; suffix?: string;
}) {
  const [draft, setDraft] = useState<string>(value != null ? fmtDe(value, 3).replace(/\.?0+$/, '').replace(/,$/, '') : '');
  const lastRef = useRef<number | null>(value);

  useEffect(() => {
    lastRef.current = value;
    setDraft(value != null ? String(value).replace('.', ',') : '');
  }, [value]);

  function commit() {
    const parsed = parseDe(draft);
    if (parsed === lastRef.current) return;
    lastRef.current = parsed;
    onCommit(parsed);
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          placeholder="—"
          className="w-full rounded-md px-2.5 py-1.5 text-sm tabular-nums"
          style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        {suffix && <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{suffix}</span>}
      </div>
    </label>
  );
}

// ── Größenklassen-Badge ──
function SizeClassBadge({ sizeClass }: { sizeClass: SizeClass }) {
  if (!sizeClass) {
    return <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>Größenklasse: — (Maße/Gewicht eingeben)</span>;
  }
  const color = sizeClass === 'Standard' ? '#4ade80' : sizeClass === 'Oversize' ? '#f5a524' : '#ff6b6b';
  return (
    <div className="flex flex-col gap-1">
      <span
        className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-md text-xs font-semibold"
        style={{ background: `${color}22`, color }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>straighten</span>
        Größenklasse: {sizeClass}
      </span>
      {sizeClass !== 'Standard' && (
        <span className="text-xs" style={{ color: '#f5a524' }}>Höhere FBA-Gebühren möglich.</span>
      )}
    </div>
  );
}

// ── Checklisten-Zähler-Logik (nicht_zutreffend zählt nirgends mit) ──
function computeCounters(items: PackagingCheckItem[]) {
  const relevant = items.filter(i => i.status !== 'nicht_zutreffend');
  const erledigt = relevant.filter(i => i.status === 'erledigt').length;
  const gesamtNenner = relevant.length;
  const prozent = gesamtNenner === 0 ? 0 : Math.round((erledigt / gesamtNenner) * 100);
  const kritisch = items.filter(i => i.severity === 'pflicht' && i.status !== 'erledigt' && i.status !== 'nicht_zutreffend').length;
  return { erledigt, gesamtNenner, prozent, kritisch };
}

// ── Checkliste (Singlebox oder Masterbox) — gruppiert nach Kategorie ──
function CheckList({ productId, items, boxLabel }: {
  productId: number; items: PackagingCheckItem[]; boxLabel: string;
}) {
  const setCheck = useSetPackagingCheck(productId);
  const createItem = useCreatePackagingItem(productId);
  const deleteItem = useDeletePackagingItem(productId);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newName, setNewName] = useState('');
  const [newRequirement, setNewRequirement] = useState('');
  const [newSeverity, setNewSeverity] = useState<PackagingCheckItem['severity']>('empfohlen');

  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const it of items) if (!seen.includes(it.category)) seen.push(it.category);
    return seen;
  }, [items]);

  const boxType = items[0]?.box_type ?? 'single';

  function toggleCat(cat: string) {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  function toggleErledigt(item: PackagingCheckItem) {
    setCheck.mutate({ itemId: item.id, status: item.status === 'erledigt' ? null : 'erledigt' });
  }
  function toggleNichtZutreffend(item: PackagingCheckItem) {
    setCheck.mutate({ itemId: item.id, status: item.status === 'nicht_zutreffend' ? null : 'nicht_zutreffend' });
  }

  function submitNewItem() {
    const name = newName.trim();
    const category = newCategory.trim();
    if (!name || !category) return;
    createItem.mutate({
      box_type: boxType as 'single' | 'master',
      category,
      name,
      requirement: newRequirement.trim() || undefined,
      severity: newSeverity,
    });
    setNewCategory(''); setNewName(''); setNewRequirement(''); setNewSeverity('empfohlen'); setShowAddForm(false);
  }

  function removeCustomItem(item: PackagingCheckItem) {
    if (window.confirm(`Eigenen Punkt „${item.name}" wirklich löschen?`)) deleteItem.mutate(item.id);
  }

  return (
    <div className="flex flex-col gap-3">
      {categories.map((cat) => {
        const catItems = items.filter(i => i.category === cat);
        const relevant = catItems.filter(i => i.status !== 'nicht_zutreffend');
        const done = relevant.filter(i => i.status === 'erledigt').length;
        const hasOpenPflicht = catItems.some(i => i.severity === 'pflicht' && i.status !== 'erledigt' && i.status !== 'nicht_zutreffend');
        const collapsed = collapsedCats.has(cat);
        return (
          <div key={cat} className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
            <button
              type="button"
              onClick={() => toggleCat(cat)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
              style={{ background: 'var(--color-surface-container)' }}
            >
              <span className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-on-surface)' }}>
                <span className="material-symbols-outlined transition-transform" style={{ fontSize: '18px', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                  expand_more
                </span>
                {cat}
                {hasOpenPflicht && <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#ff6b6b' }} title="Offene Pflicht-Punkte">warning</span>}
              </span>
              <span className="text-xs tabular-nums font-semibold" style={{ color: 'var(--color-on-surface-variant)' }}>
                {done}/{relevant.length}
              </span>
            </button>
            {!collapsed && (
              <div className="flex flex-col divide-y" style={{ background: 'var(--color-surface-container-low)' }}>
                {catItems.map((item) => {
                  const dimmed = item.status === 'nicht_zutreffend';
                  return (
                    <div
                      key={item.id}
                      className="flex items-start gap-2.5 px-3 py-2.5"
                      style={{ opacity: dimmed ? 0.45 : 1, borderColor: 'rgba(255,255,255,0.06)' }}
                      title={item.description ?? undefined}
                    >
                      <button
                        type="button"
                        onClick={() => toggleErledigt(item)}
                        aria-label={item.status === 'erledigt' ? 'Als offen markieren' : 'Als erledigt markieren'}
                        className="mt-0.5 flex items-center justify-center rounded-md flex-shrink-0"
                        style={{ width: '22px', height: '22px' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '20px', color: item.status === 'erledigt' ? '#4ade80' : 'var(--color-on-surface-variant)' }}>
                          {item.status === 'erledigt' ? 'check_box' : 'check_box_outline_blank'}
                        </span>
                      </button>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{item.name}</span>
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{ background: `${SEVERITY_COLORS[item.severity]}22`, color: SEVERITY_COLORS[item.severity] }}
                          >
                            {SEVERITY_LABELS[item.severity]}
                          </span>
                          {item.is_custom && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}>
                              eigener Punkt
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.85 }}>{item.description}</span>
                        )}
                      </div>
                      <span className="text-xs text-right flex-shrink-0 max-w-[160px]" style={{ color: 'var(--color-on-surface-variant)' }}>
                        {item.requirement ?? ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleNichtZutreffend(item)}
                        aria-label={dimmed ? 'Wieder relevant machen' : 'Als nicht zutreffend markieren'}
                        title={dimmed ? 'Wieder relevant machen' : 'Nicht zutreffend'}
                        className="flex items-center justify-center rounded-md flex-shrink-0"
                        style={{ width: '22px', height: '22px', color: dimmed ? OBERPUNKT_ACCENT : 'var(--color-on-surface-variant)' }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                          {dimmed ? 'visibility_off' : 'visibility'}
                        </span>
                      </button>
                      {item.is_custom && (
                        <button
                          type="button"
                          onClick={() => removeCustomItem(item)}
                          aria-label="Löschen"
                          className="flex items-center justify-center rounded-md flex-shrink-0"
                          style={{ width: '22px', height: '22px', color: '#ff6b6b' }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {!showAddForm ? (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
          Eigenen Punkt für {boxLabel} hinzufügen
        </button>
      ) : (
        <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Kategorie"
              className="flex-1 rounded-md px-2.5 py-1.5 text-sm"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name des Punkts"
              className="flex-1 rounded-md px-2.5 py-1.5 text-sm"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newRequirement}
              onChange={(e) => setNewRequirement(e.target.value)}
              placeholder="Sollwert (optional)"
              className="flex-1 rounded-md px-2.5 py-1.5 text-sm"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <select
              value={newSeverity}
              onChange={(e) => setNewSeverity(e.target.value as PackagingCheckItem['severity'])}
              className="rounded-md px-2.5 py-1.5 text-sm"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <option value="pflicht">Pflicht</option>
              <option value="empfohlen">Empfohlen</option>
              <option value="optional">Optional</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAddForm(false)} className="px-3 py-1.5 rounded-md text-xs" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}>
              Abbrechen
            </button>
            <button type="button" onClick={submitNewItem} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: OBERPUNKT_ACCENT, color: '#1a1a1a' }}>
              Hinzufügen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── „Als final markieren"-Hinweisbox ──
function FinalToggle({ label, final, onToggle }: { label: string; final: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left w-full"
      style={{
        background: final ? 'rgba(74,222,128,0.12)' : 'var(--color-surface-container)',
        border: `1px solid ${final ? '#4ade8055' : 'rgba(255,255,255,0.08)'}`,
        color: final ? '#4ade80' : 'var(--color-on-surface-variant)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
        {final ? 'verified' : 'radio_button_unchecked'}
      </span>
      {final ? `${label} — als final markiert` : `${label} als final markieren`}
    </button>
  );
}

export function PackagingSection({ productId, productName }: Props) {
  const { expanded, toggle } = useSectionExpanded(productId, 'packaging', false);
  const { data, isLoading, isError, refetch } = useAmazonPackaging(productId);
  const savePkg = useSavePackaging(productId);
  const setFinal = useSetPackagingFinal(productId);
  const saveGpsr = useSaveGpsr(productId);
  const { data: mfrData } = useManufacturers(productId);

  const [tab, setTab] = useState<'single' | 'master'>('single');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [mfrPickerOpen, setMfrPickerOpen] = useState(false);

  function commit(patch: PackagingPatch) {
    savePkg.mutate(patch);
  }

  if (!expanded) {
    return (
      <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <SectionHeader icon="inventory_2" title="Verpackung & Versand" accent={OBERPUNKT_ACCENT} expanded={expanded} onToggleExpand={toggle} />
      </section>
    );
  }

  const pkg = data?.packaging;
  const singleItems = data?.items.filter(i => i.box_type === 'single') ?? [];
  const masterItems = data?.items.filter(i => i.box_type === 'master') ?? [];
  const singleCounters = computeCounters(singleItems);
  const masterCounters = computeCounters(masterItems);
  const activeItems = tab === 'single' ? singleItems : masterItems;

  const sizeClass = pkg ? computeSizeClass(pkg.single_w, pkg.single_h, pkg.single_d, pkg.single_weight_kg) : null;
  const masterWeight = pkg && pkg.units_per_master != null && pkg.single_weight_kg != null
    ? pkg.units_per_master * pkg.single_weight_kg + (pkg.master_tare_kg ?? 0)
    : null;
  const cbmPerBox = pkg && pkg.master_w != null && pkg.master_h != null && pkg.master_d != null
    ? (pkg.master_w * pkg.master_h * pkg.master_d) / 1_000_000
    : null;
  const masterboxAnzahl = pkg && pkg.order_qty != null && pkg.units_per_master
    ? Math.ceil(pkg.order_qty / pkg.units_per_master)
    : null;
  const gesamtCbm = masterboxAnzahl != null && cbmPerBox != null ? masterboxAnzahl * cbmPerBox : null;
  const gesamtgewicht = masterboxAnzahl != null && masterWeight != null ? masterboxAnzahl * masterWeight : null;

  const manufacturers = mfrData?.manufacturers ?? [];

  function applyManufacturer(m: { name: string; adresse: string | null; ansprechpartner: string | null; email: string | null }) {
    const contactParts = [m.ansprechpartner, m.email].filter(Boolean);
    commit({ mfr_name: m.name, mfr_address: m.adresse ?? undefined, mfr_contact: contactParts.join(' · ') || undefined });
    setMfrPickerOpen(false);
  }

  function onMfrButtonClick() {
    if (manufacturers.length === 0) return;
    if (manufacturers.length === 1) { applyManufacturer(manufacturers[0]); return; }
    setMfrPickerOpen(prev => !prev);
  }

  async function onDownloadPdf() {
    setPdfError(null);
    setPdfLoading(true);
    try {
      await downloadPackagingBriefing(productId, `Verpackung-Briefing-${productName}.pdf`);
    } catch {
      setPdfError('PDF konnte nicht erstellt werden.');
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader icon="inventory_2" title="Verpackung & Versand" accent={OBERPUNKT_ACCENT} expanded={expanded} onToggleExpand={toggle} />
      <div className="p-4 pt-0 flex flex-col gap-5">
        {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
        {isError && (
          <button type="button" onClick={() => refetch()} className="self-start px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
        )}

        {data && pkg && (
          <>
            {/* ── Reiter Singlebox / Masterbox ── */}
            <div className="flex items-center gap-2">
              {(['single', 'master'] as const).map((t) => {
                const active = tab === t;
                const c = t === 'single' ? singleCounters : masterCounters;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium"
                    style={{
                      background: active ? OBERPUNKT_ACCENT : 'var(--color-surface-container)',
                      color: active ? '#1a1a1a' : 'var(--color-on-surface-variant)',
                    }}
                  >
                    {t === 'single' ? 'Singlebox' : 'Masterbox'}
                    <span className="tabular-nums text-xs opacity-80">{c.prozent}%</span>
                    {c.kritisch > 0 && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#ff6b6b', color: '#fff' }}>
                        {c.kritisch} kritisch
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {tab === 'single' && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <NumberField label="Breite (cm)" value={pkg.single_w} onCommit={(n) => commit({ single_w: n ?? undefined })} />
                  <NumberField label="Höhe (cm)" value={pkg.single_h} onCommit={(n) => commit({ single_h: n ?? undefined })} />
                  <NumberField label="Tiefe (cm)" value={pkg.single_d} onCommit={(n) => commit({ single_d: n ?? undefined })} />
                  <NumberField label="Einzelgewicht" value={pkg.single_weight_kg} onCommit={(n) => commit({ single_weight_kg: n ?? undefined })} suffix="kg" />
                </div>
                <SizeClassBadge sizeClass={sizeClass} />
                <CheckList productId={productId} items={activeItems} boxLabel="Singlebox" />
                <FinalToggle label="Singlebox" final={pkg.single_final === 1} onToggle={() => setFinal.mutate({ box: 'single', final: pkg.single_final === 1 ? 0 : 1 })} />
              </div>
            )}

            {tab === 'master' && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <NumberField label="Breite (cm)" value={pkg.master_w} onCommit={(n) => commit({ master_w: n ?? undefined })} />
                  <NumberField label="Höhe (cm)" value={pkg.master_h} onCommit={(n) => commit({ master_h: n ?? undefined })} />
                  <NumberField label="Tiefe (cm)" value={pkg.master_d} onCommit={(n) => commit({ master_d: n ?? undefined })} />
                  <NumberField label="Einheiten/Box" value={pkg.units_per_master} onCommit={(n) => commit({ units_per_master: n ?? undefined })} />
                  <NumberField label="Leergewicht (Tara)" value={pkg.master_tare_kg} onCommit={(n) => commit({ master_tare_kg: n ?? undefined })} suffix="kg" />
                </div>
                <div className="flex flex-col gap-1 text-sm tabular-nums" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {pkg.units_per_master != null && pkg.single_weight_kg != null ? (
                    <span>
                      {fmtDe(pkg.units_per_master, 0)} × {fmtDe(pkg.single_weight_kg, 2)} kg + {fmtDe(pkg.master_tare_kg ?? 0, 2)} kg
                      {' = '}<strong style={{ color: 'var(--color-on-surface)' }}>{fmtDe(masterWeight, 2)} kg</strong> (automatisch berechnet)
                    </span>
                  ) : (
                    <span className="opacity-70">Masterbox-Gewicht: Einzelgewicht (Singlebox) und Einheiten/Box eingeben.</span>
                  )}
                  <span>CBM/Box: <strong style={{ color: 'var(--color-on-surface)' }}>{fmtDe(cbmPerBox, 3)}</strong></span>
                </div>
                <CheckList productId={productId} items={activeItems} boxLabel="Masterbox" />
                <FinalToggle label="Masterbox" final={pkg.master_final === 1} onToggle={() => setFinal.mutate({ box: 'master', final: pkg.master_final === 1 ? 0 : 1 })} />
              </div>
            )}

            {/* ── Versand-/Import-Rechner ── */}
            <div className="rounded-lg p-3 flex flex-col gap-2" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>
                Versand-/Import-Rechner
              </span>
              <div className="max-w-xs">
                <NumberField label="Bestellmenge (Stück)" value={pkg.order_qty} onCommit={(n) => commit({ order_qty: n ?? undefined })} />
              </div>
              <div className="text-sm tabular-nums flex flex-col gap-1 mt-1" style={{ color: 'var(--color-on-surface)' }}>
                <span>Masterbox-Anzahl: <strong>{masterboxAnzahl != null ? fmtDe(masterboxAnzahl, 0) : '—'}</strong></span>
                <span>Gesamt-CBM: <strong>{fmtDe(gesamtCbm, 3)}</strong></span>
                <span>Gesamtgewicht: <strong>{fmtDe(gesamtgewicht, 1)} kg</strong></span>
                <span className="opacity-70">Einzelgewicht: {fmtDe(pkg.single_weight_kg, 2)} kg · Singlebox: {fmtDe(pkg.single_w)}×{fmtDe(pkg.single_h)}×{fmtDe(pkg.single_d)} cm · Masterbox: {fmtDe(pkg.master_w)}×{fmtDe(pkg.master_h)}×{fmtDe(pkg.master_d)} cm</span>
              </div>
            </div>

            {/* ── GPSR-Block ── */}
            <div className="rounded-lg p-3 flex flex-col gap-4" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>GPSR-Angaben</span>

              <div className="flex flex-col gap-2">
                <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>EU-Verantwortlicher — gilt für alle Produkte</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <TextField label="Name / Firma" value={data.gpsr.responsible.name} onCommit={(v) => saveGpsr.mutate({ name: v })} />
                  <TextField label="Adresse" value={data.gpsr.responsible.address} onCommit={(v) => saveGpsr.mutate({ address: v })} />
                  <TextField label="E-Mail" value={data.gpsr.responsible.email} onCommit={(v) => saveGpsr.mutate({ email: v })} />
                  <TextField label="Telefon" value={data.gpsr.responsible.phone} onCommit={(v) => saveGpsr.mutate({ phone: v })} />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Hersteller-Angaben — produktspezifisch</span>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={onMfrButtonClick}
                      disabled={manufacturers.length === 0}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-50"
                      style={{ background: OBERPUNKT_ACCENT, color: '#1a1a1a' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>content_copy</span>
                      Aus Hersteller übernehmen
                    </button>
                    {mfrPickerOpen && manufacturers.length > 1 && (
                      <div className="absolute right-0 mt-1 z-10 rounded-lg p-1.5 shadow-xl" style={{ width: 220, background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.12)' }}>
                        {manufacturers.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => applyManufacturer(m)}
                            className="w-full text-left px-2 py-1.5 rounded-md text-xs hover:bg-white/5"
                            style={{ color: 'var(--color-on-surface)' }}
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {manufacturers.length === 0 && (
                  <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>Noch keine Hersteller angelegt.</span>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <TextField label="Name" value={pkg.mfr_name ?? ''} onCommit={(v) => commit({ mfr_name: v })} />
                  <TextField label="Adresse" value={pkg.mfr_address ?? ''} onCommit={(v) => commit({ mfr_address: v })} />
                  <TextField label="Kontakt" value={pkg.mfr_contact ?? ''} onCommit={(v) => commit({ mfr_contact: v })} />
                </div>
              </div>

              <div className="rounded-md p-2.5 text-xs flex flex-col gap-1" style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)' }}>
                <span className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>Vorschau (geht ins PDF/an den Designer)</span>
                <span>EU-Verantwortlicher: {data.gpsr.responsible.name || '—'}, {data.gpsr.responsible.address || '—'}, {data.gpsr.responsible.email || '—'}</span>
                <span>Hersteller: {pkg.mfr_name || '—'}, {pkg.mfr_address || '—'}, {pkg.mfr_contact || '—'}</span>
              </div>
            </div>

            {/* ── Designer-Briefing PDF ── */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onDownloadPdf}
                disabled={pdfLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-60"
                style={{ background: OBERPUNKT_ACCENT, color: '#1a1a1a' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>picture_as_pdf</span>
                {pdfLoading ? 'Wird erstellt …' : 'Designer-Briefing PDF'}
              </button>
              {pdfError && <span className="text-xs" style={{ color: '#ff6b6b' }}>{pdfError}</span>}
            </div>

            {/* ── Notizen ── */}
            <NotesField productId={productId} initialNotes={pkg.notes} />
          </>
        )}
      </div>
    </section>
  );
}

function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const lastRef = useRef(value);
  useEffect(() => { lastRef.current = value; setDraft(value); }, [value]);
  function commit() {
    if (draft === lastRef.current) return;
    lastRef.current = draft;
    onCommit(draft);
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        className="w-full rounded-md px-2.5 py-1.5 text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
      />
    </label>
  );
}

const NOTES_AUTOSAVE_DELAY_MS = 600;
const MAX_NOTES = 20000;

function NotesField({ productId, initialNotes }: { productId: number; initialNotes: string }) {
  const save = useSavePackaging(productId);
  const [value, setValue] = useState(initialNotes);
  const lastSavedRef = useRef(initialNotes);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setValue(initialNotes);
    lastSavedRef.current = initialNotes;
  }, [initialNotes]);

  function persist(next: string) {
    if (next === lastSavedRef.current) return;
    lastSavedRef.current = next;
    save.mutate({ notes: next });
  }
  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { timerRef.current = null; persist(next); }, NOTES_AUTOSAVE_DELAY_MS);
  }
  function onBlur() {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    persist(value);
  }
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Notizen</label>
      <textarea
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        maxLength={MAX_NOTES}
        placeholder="Freier Notizbereich — Besonderheiten, offene Fragen, Rücksprachen mit dem Designer …"
        spellCheck={false}
        className="w-full rounded-lg px-3 py-2 text-sm resize-none"
        style={{
          minHeight: '100px',
          background: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'inherit',
          lineHeight: '1.5',
        }}
      />
      <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>Wird automatisch gespeichert.</p>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  fetchDjServicesAll, fetchDjPackages,
  createDjService, updateDjService, deactivateDjService, createDjPackage,
  type DjService, type DjPackage,
} from '../../api/dj.api';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import { formatCurrency } from '../../lib/format';

// ─── Gemeinsame Styles ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,170,255,0.2)',
  borderRadius: '0.5rem',
  color: 'var(--color-on-surface)',
  padding: '0.5rem 0.875rem',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box' as const,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontSize: '0.8rem',
  color: 'var(--color-on-surface-variant)',
  marginBottom: '0.375rem',
};

const btnPrimary: React.CSSProperties = {
  background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
  border: 'none',
  borderRadius: '0.5rem',
  color: '#060e20',
  padding: '0.5rem 1.25rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  fontWeight: 700,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  whiteSpace: 'nowrap' as const,
  boxShadow: '0 0 16px rgba(148,170,255,0.3)',
};

const btnSecondary: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,170,255,0.2)',
  borderRadius: '0.5rem',
  color: 'var(--color-on-surface)',
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  whiteSpace: 'nowrap' as const,
};

// ─── StatusPill ───────────────────────────────────────────────────────────────

function StatusPill({ active }: { active: number }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '0.2rem 0.625rem',
      borderRadius: '999px',
      fontSize: '0.75rem',
      fontFamily: 'var(--font-body)',
      fontWeight: 600,
      background: active === 1 ? 'rgba(92,253,128,0.15)' : 'rgba(255,255,255,0.05)',
      color: active === 1 ? 'var(--color-secondary)' : 'var(--color-on-surface-variant)',
    }}>
      {active === 1 ? 'Aktiv' : 'Inaktiv'}
    </span>
  );
}

// ─── ServiceSlideOver ────────────────────────────────────────────────────────

function ServiceSlideOver({
  editing,
  defaultCategory,
  onClose,
  onSaved,
}: {
  editing: DjService | null;
  defaultCategory?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const [name, setName] = useState(editing?.name ?? '');
  const [category, setCategory] = useState(editing?.category ?? defaultCategory ?? '');
  const [unit, setUnit] = useState(editing?.unit ?? 'Stück');
  const [priceNet, setPriceNet] = useState(editing ? String(editing.price_net) : '');
  const [taxRate, setTaxRate] = useState(editing ? String(editing.tax_rate) : '19');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSave() {
    if (!name.trim() || !category.trim() || !priceNet) {
      setError('Name, Kategorie und Preis sind erforderlich');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateDjService(editing.id, {
          category: category.trim(),
          name: name.trim(),
          unit: unit.trim() || 'Stück',
          price_net: Number(priceNet),
          tax_rate: Number(taxRate),
          description: description.trim() || null,
        });
      } else {
        await createDjService({
          category: category.trim(),
          name: name.trim(),
          unit: unit.trim() || 'Stück',
          price_net: Number(priceNet),
          tax_rate: Number(taxRate),
          description: description.trim() || null,
        });
      }
      onSaved();
      onClose();
    } catch {
      setError('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  const modalBaseStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(480px, 92vw)',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '1rem',
    boxShadow: '0 16px 64px rgba(0,0,0,0.7)',
    zIndex: 9001,
    overflow: 'hidden',
    ...modalStyle,
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div data-draggable-modal style={modalBaseStyle}>
        <div
          onMouseDown={onMouseDown}
          style={{
            ...headerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(148,170,255,0.2)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)' }}>
            {editing ? 'Leistung bearbeiten' : 'Neue Leistung'}
          </span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>close</span>
          </button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.5rem', padding: '0.625rem 1rem', color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div>
            <label style={labelStyle}>Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Bühnenlicht-Set" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Kategorie *</label>
            <input type="text" value={category} onChange={e => setCategory(e.target.value)} placeholder="z.B. Sound" style={inputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Einheit</label>
              <input type="text" value={unit} onChange={e => setUnit(e.target.value)} placeholder="Stück" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>MwSt-Satz (%)</label>
              <input type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)} min="0" max="100" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Preis netto (€) *</label>
            <input type="number" value={priceNet} onChange={e => setPriceNet(e.target.value)} placeholder="0.00" min="0" step="0.01" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Beschreibung</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optionale Beschreibung..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid rgba(148,170,255,0.2)' }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Abbrechen</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── PackageSlideOver ────────────────────────────────────────────────────────

function PackageSlideOver({ services, onClose, onSaved }: { services: DjService[]; onClose: () => void; onSaved: () => void }) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceNet, setPriceNet] = useState('');
  const [taxRate, setTaxRate] = useState('19');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const activeServices = services.filter(s => s.active === 1);

  const grouped = activeServices.reduce<Record<string, DjService[]>>((acc, s) => {
    const cat = s.category || 'Sonstige';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  function toggleService(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!name.trim() || !priceNet) {
      setError('Name und Preis sind erforderlich');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createDjPackage({
        name: name.trim(),
        description: description.trim() || undefined,
        price_net: Number(priceNet),
        tax_rate: Number(taxRate),
        service_ids: selectedIds,
      });
      onSaved();
      onClose();
    } catch {
      setError('Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  }

  const modalBaseStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(520px, 92vw)',
    maxHeight: '90vh',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: '1rem',
    boxShadow: '0 16px 64px rgba(0,0,0,0.7)',
    zIndex: 9001,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    ...modalStyle,
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div data-draggable-modal style={modalBaseStyle}>
        <div
          onMouseDown={onMouseDown}
          style={{
            ...headerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(148,170,255,0.2)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)' }}>
            Neues Paket
          </span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>close</span>
          </button>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', flex: 1 }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.5rem', padding: '0.625rem 1rem', color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div>
            <label style={labelStyle}>Name *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Hochzeits-Paket" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Beschreibung</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optionale Beschreibung..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Preis netto (€) *</label>
              <input type="number" value={priceNet} onChange={e => setPriceNet(e.target.value)} placeholder="0.00" min="0" step="0.01" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>MwSt-Satz (%)</label>
              <input type="number" value={taxRate} onChange={e => setTaxRate(e.target.value)} min="0" max="100" style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={{ ...labelStyle, marginBottom: '0.625rem' }}>
              Enthaltene Leistungen ({selectedIds.length} ausgewählt)
            </label>
            {Object.entries(grouped).map(([cat, catServices]) => (
              <div key={cat} style={{ marginBottom: '0.75rem' }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600, marginBottom: '0.375rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {cat}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {catServices.map(s => (
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', padding: '0.375rem 0.5rem', borderRadius: '0.375rem', background: selectedIds.includes(s.id) ? 'rgba(148,170,255,0.1)' : 'transparent' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => toggleService(s.id)}
                        style={{ accentColor: 'var(--color-primary)', width: '1rem', height: '1rem', flexShrink: 0 }}
                      />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', flex: 1 }}>{s.name}</span>
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>{formatCurrency(s.price_net)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {activeServices.length === 0 && (
              <p style={{ color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                Keine aktiven Leistungen vorhanden.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid rgba(148,170,255,0.2)', flexShrink: 0 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Abbrechen</button>
          <button type="button" onClick={() => void handleSave()} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── DjServicesPage ──────────────────────────────────────────────────────────

export function DjServicesPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'pakete' | 'katalog'>('pakete');
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [serviceSlideOver, setServiceSlideOver] = useState<{ open: boolean; editing: DjService | null; defaultCategory?: string }>({ open: false, editing: null });
  const [packageSlideOver, setPackageSlideOver] = useState(false);

  // ── Daten laden ────────────────────────────────────────────────────────────

  const { data: services = [], isLoading: svcLoading } = useQuery({
    queryKey: ['dj-services-all'],
    queryFn: fetchDjServicesAll,
  });

  const { data: packages = [], isLoading: pkgLoading } = useQuery({
    queryKey: ['dj-packages'],
    queryFn: fetchDjPackages,
  });

  const loading = svcLoading || pkgLoading;

  // Default: erstes Paket auswählen
  const firstPackageId = packages[0]?.id ?? null;
  const effectiveSelectedId = selectedPackageId ?? firstPackageId;
  const selectedPackage = packages.find(p => p.id === effectiveSelectedId) ?? null;

  // Alle Kategorien offen, wenn services geladen
  const allCategories = Array.from(new Set(services.map(s => s.category || 'Sonstige')));
  const [categoriesInitialized, setCategoriesInitialized] = useState(false);
  if (!categoriesInitialized && allCategories.length > 0) {
    setOpenCategories(new Set(allCategories));
    setCategoriesInitialized(true);
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  const toggleServiceMutation = useMutation({
    mutationFn: async (service: DjService) => {
      if (service.active === 1) {
        return deactivateDjService(service.id);
      } else {
        return updateDjService(service.id, { active: 1 });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['dj-services-all'] });
    },
  });

  // ── KPI ────────────────────────────────────────────────────────────────────

  const activeServices = services.filter(s => s.active === 1);
  const stundensatzServices = activeServices.filter(s => s.unit === 'Stunde');
  const avgStundensatz = stundensatzServices.length > 0
    ? stundensatzServices.reduce((sum, s) => sum + s.price_net, 0) / stundensatzServices.length
    : 0;

  // ── Accordion Toggle ───────────────────────────────────────────────────────

  function toggleCategory(cat: string) {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  // ── Services nach Kategorie gruppieren ────────────────────────────────────

  const grouped = services.reduce<Record<string, DjService[]>>((acc, s) => {
    const cat = s.category || 'Sonstige';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(s);
    return acc;
  }, {});

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>

        {/* Ambient Glow oben rechts (blau) */}
        <div aria-hidden style={{
          position: 'absolute',
          top: '-100px',
          right: '-100px',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(148,170,255,0.06) 0%, transparent 60%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* Ambient Glow unten links (grün) */}
        <div aria-hidden style={{
          position: 'absolute',
          bottom: '-80px',
          left: '-80px',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(92,253,128,0.04) 0%, transparent 60%)',
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        {/* Content über den Glows */}
        <div style={{ position: 'relative', zIndex: 1 }}>

          {/* ── Page Header ──────────────────────────────────── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-headline)',
                fontWeight: 800,
                fontSize: '3rem',
                letterSpacing: '-0.02em',
                color: 'var(--color-on-surface)',
                margin: 0,
                lineHeight: 1.1,
                textTransform: 'uppercase',
              }}>
                Leistungen &amp; Pakete
              </h1>
            </div>

            {/* Header-Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setServiceSlideOver({ open: true, editing: null })}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--color-on-surface)',
                  border: '1px solid rgba(148,170,255,0.2)',
                  borderRadius: '0.75rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                Neue Leistung
              </button>
              <button
                type="button"
                onClick={() => setPackageSlideOver(true)}
                style={{
                  background: 'var(--color-primary-container)',
                  color: 'var(--color-on-primary-container)',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                Neues Paket
              </button>
            </div>
          </div>

          {/* ── KPI-Karten ───────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>

            {/* Aktive Leistungen */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Aktive Leistungen
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1, margin: 0 }}>
                  {loading ? '–' : activeServices.length}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-primary)', opacity: 0.7 }}>check_circle</span>
            </div>

            {/* Pakete */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Pakete
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1, margin: 0 }}>
                  {loading ? '–' : packages.length}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-primary)', opacity: 0.7 }}>workspaces</span>
            </div>

            {/* Ø Stundensatz */}
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: 0, marginBottom: '0.375rem' }}>
                  Ø Stundensatz
                </p>
                <p style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-on-surface)', lineHeight: 1, margin: 0 }}>
                  {loading ? '–' : (avgStundensatz > 0 ? formatCurrency(avgStundensatz) : '–')}
                </p>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: '28px', color: 'var(--color-primary)', opacity: 0.7 }}>schedule</span>
            </div>

          </div>

          {/* ── Segmented Toggle ─────────────────────────────── */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{
              display: 'inline-flex',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '0.5rem',
              padding: '0.25rem',
              gap: 0,
            }}>
              {(['pakete', 'katalog'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  style={{
                    background: view === v ? 'var(--color-primary)' : 'transparent',
                    color: view === v ? 'var(--color-on-primary)' : 'var(--color-on-surface-variant)',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 1.25rem',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    fontWeight: view === v ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'background 150ms, color 150ms',
                  }}
                >
                  {v === 'pakete' ? 'Pakete' : 'Leistungskatalog'}
                </button>
              ))}
            </div>
          </div>

          {/* ── Ladeindikator ────────────────────────────────── */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
              Lade...
            </div>
          )}

          {/* ── Pakete-Ansicht (Two-Panel) ───────────────────── */}
          {!loading && view === 'pakete' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>

              {/* Linkes Panel — Buchungspakete-Liste */}
              <div>
                <p style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)', margin: 0, marginBottom: '1rem' }}>
                  Buchungspakete
                </p>

                {packages.length === 0 ? (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.875rem' }}>
                    Keine Pakete vorhanden.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {packages.map(pkg => {
                      const isSelected = pkg.id === effectiveSelectedId;
                      return (
                        <div
                          key={pkg.id}
                          onClick={() => setSelectedPackageId(pkg.id)}
                          style={{
                            background: isSelected ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
                            borderRadius: '0.75rem',
                            padding: '1rem 1.25rem',
                            cursor: 'pointer',
                            borderLeft: isSelected ? '3px solid var(--color-primary)' : '3px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.75rem',
                            transition: 'background 120ms',
                          }}
                          onMouseEnter={e => {
                            if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                          }}
                          onMouseLeave={e => {
                            if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)';
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {pkg.name}
                            </div>
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: '0.2rem' }}>
                              {pkg.services?.length ?? 0} Leistungen
                            </div>
                          </div>
                          <div style={{
                            background: 'rgba(255,255,255,0.08)',
                            borderRadius: '999px',
                            padding: '0.25rem 0.75rem',
                            fontFamily: 'var(--font-body)',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            color: 'var(--color-on-surface)',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}>
                            {formatCurrency(pkg.price_net * (1 + pkg.tax_rate / 100))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setPackageSlideOver(true)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)', fontFamily: 'var(--font-body)', fontSize: '0.875rem', padding: '0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
                  Neues Paket
                </button>
              </div>

              {/* Rechtes Panel — Paket-Detail */}
              <div>
                {selectedPackage === null ? (
                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '0.75rem',
                    padding: '3rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.75rem',
                    minHeight: '240px',
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--color-on-surface-variant)', opacity: 0.3 }}>touch_app</span>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                      Paket auswählen
                    </p>
                  </div>
                ) : (
                  <div style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '0.75rem',
                    padding: '1.5rem',
                  }}>
                    {/* Paket-Name + Status */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.5rem' }}>
                      <h2 style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.2 }}>
                        {selectedPackage.name}
                      </h2>
                      <StatusPill active={selectedPackage.active} />
                    </div>

                    {selectedPackage.description && (
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: '0 0 1rem 0' }}>
                        {selectedPackage.description}
                      </p>
                    )}

                    {/* Preis */}
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontFamily: 'var(--font-headline)', fontSize: '2rem', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1 }}>
                        {formatCurrency(selectedPackage.price_net * (1 + selectedPackage.tax_rate / 100))}
                      </div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
                        inkl. {selectedPackage.tax_rate} % MwSt
                      </div>
                    </div>

                    {/* Separator */}
                    <div style={{ borderTop: '1px solid rgba(148,170,255,0.2)', margin: '1rem 0' }} />

                    {/* Enthaltene Leistungen */}
                    <div>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)', margin: '0 0 0.75rem 0' }}>
                        Enthaltene Leistungen
                      </p>

                      {selectedPackage.services && selectedPackage.services.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                          {selectedPackage.services.map(s => (
                            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0, display: 'inline-block' }} />
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--color-on-surface)', flex: 1 }}>
                                {s.name}
                              </span>
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
                                {formatCurrency(s.price_net)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', margin: 0 }}>
                          Keine Leistungen zugeordnet
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ── Leistungskatalog-Ansicht (Accordion) ────────── */}
          {!loading && view === 'katalog' && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {Object.keys(grouped).length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                  Keine Leistungen vorhanden.
                </div>
              ) : (
                Object.entries(grouped).map(([cat, catServices]) => {
                  const isOpen = openCategories.has(cat);
                  return (
                    <div
                      key={cat}
                      style={{
                        borderBottom: '1px solid rgba(148,170,255,0.2)',
                      }}
                    >
                      {/* Kategorie-Header */}
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat)}
                        style={{
                          width: '100%',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.875rem 0',
                          textAlign: 'left',
                        }}
                      >
                        <span
                          className="material-symbols-outlined"
                          style={{
                            fontSize: '1.25rem',
                            color: 'var(--color-on-surface-variant)',
                            transition: 'transform 200ms ease',
                            transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                            flexShrink: 0,
                          }}
                        >
                          expand_more
                        </span>
                        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-on-surface)', flex: 1 }}>
                          {cat}
                        </span>
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
                          {catServices.length} {catServices.length === 1 ? 'Eintrag' : 'Einträge'}
                        </span>
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setServiceSlideOver({ open: true, editing: null, defaultCategory: cat });
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-primary)',
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '0.375rem',
                            flexShrink: 0,
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(148,170,255,0.1)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>add</span>
                          Leistung
                        </button>
                      </button>

                      {/* Accordion-Body */}
                      {isOpen && (
                        <div style={{ paddingBottom: '0.5rem' }}>
                          {catServices.map((s, idx) => (
                            <div
                              key={s.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0.75rem 1rem',
                                background: idx % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                                borderRadius: '0.375rem',
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--color-on-surface)', fontWeight: 500 }}>
                                  {s.name}
                                </span>
                                {s.description && (
                                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginLeft: '0.5rem' }}>
                                    {s.description}
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>
                                  {s.unit}
                                </span>
                                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.9rem', color: s.price_net > 0 ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)' }}>
                                  {s.price_net > 0 ? formatCurrency(s.price_net) : 'kein Preis'}
                                </span>
                                <StatusPill active={s.active} />

                                {/* Edit-Button */}
                                <button
                                  type="button"
                                  title="Leistung bearbeiten"
                                  onClick={() => setServiceSlideOver({ open: true, editing: s })}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'inline-flex', alignItems: 'center', padding: '0.25rem', borderRadius: '0.375rem' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-primary)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-on-surface-variant)'; }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>edit</span>
                                </button>

                                {/* Toggle Aktiv/Inaktiv */}
                                <button
                                  type="button"
                                  title={s.active === 1 ? 'Deaktivieren' : 'Aktivieren'}
                                  onClick={() => toggleServiceMutation.mutate(s)}
                                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'inline-flex', alignItems: 'center', padding: '0.25rem', borderRadius: '0.375rem' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-error)'; }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--color-on-surface-variant)'; }}
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>
                                    {s.active === 1 ? 'toggle_on' : 'toggle_off'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>{/* /content-wrapper */}
      </div>

      {/* Slide-Overs */}
      {serviceSlideOver.open && (
        <ServiceSlideOver
          editing={serviceSlideOver.editing}
          defaultCategory={serviceSlideOver.defaultCategory}
          onClose={() => setServiceSlideOver({ open: false, editing: null })}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['dj-services-all'] })}
        />
      )}
      {packageSlideOver && (
        <PackageSlideOver
          services={services}
          onClose={() => setPackageSlideOver(false)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['dj-packages'] })}
        />
      )}
    </PageWrapper>
  );
}

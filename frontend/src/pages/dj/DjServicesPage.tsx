import { useState, useEffect } from 'react';
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
  border: '1px solid var(--color-outline-variant)',
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
  background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
  border: 'none',
  borderRadius: '0.5rem',
  color: '#000',
  padding: '0.5rem 1.25rem',
  cursor: 'pointer',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  fontWeight: 600,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.375rem',
  whiteSpace: 'nowrap' as const,
};

const btnSecondary: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--color-outline-variant)',
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

// ─── KPI-Karte ───────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{
      background: 'var(--color-surface-container)',
      borderRadius: '0.75rem',
      padding: '1.25rem 1.5rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-primary)' }}>{icon}</span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>{label}</span>
      </div>
      <span style={{ fontFamily: 'var(--font-headline)', fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

// ─── ServiceSlideOver ────────────────────────────────────────────────────────

function ServiceSlideOver({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('Stück');
  const [priceNet, setPriceNet] = useState('');
  const [taxRate, setTaxRate] = useState('19');
  const [description, setDescription] = useState('');
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
      await createDjService({
        category: category.trim(),
        name: name.trim(),
        unit: unit.trim() || 'Stück',
        price_net: Number(priceNet),
        tax_rate: Number(taxRate),
        description: description.trim() || null,
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
    width: 'min(480px, 92vw)',
    background: 'var(--color-surface-container)',
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
        {/* Header */}
        <div
          onMouseDown={onMouseDown}
          style={{
            ...headerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-outline-variant)',
          }}
        >
          <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-on-surface)' }}>
            Neue Leistung
          </span>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>close</span>
          </button>
        </div>

        {/* Body */}
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

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--color-outline-variant)' }}>
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

  // Gruppierung nach Kategorie
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
    background: 'var(--color-surface-container)',
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
        {/* Header */}
        <div
          onMouseDown={onMouseDown}
          style={{
            ...headerStyle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-outline-variant)',
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

        {/* Body (scrollbar) */}
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

          {/* Leistungsauswahl */}
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
                    <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', padding: '0.375rem 0.5rem', borderRadius: '0.375rem', background: selectedIds.includes(s.id) ? 'rgba(var(--color-primary-rgb, 204,151,255),0.1)' : 'transparent' }}>
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

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid var(--color-outline-variant)', flexShrink: 0 }}>
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
  const [tab, setTab] = useState<'leistungen' | 'pakete'>('leistungen');
  const [services, setServices] = useState<DjService[]>([]);
  const [packages, setPackages] = useState<DjPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [serviceSlideOver, setServiceSlideOver] = useState(false);
  const [packageSlideOver, setPackageSlideOver] = useState(false);

  // ── Laden ──────────────────────────────────────────────────────────────────

  async function loadAll() {
    setLoading(true);
    try {
      const [svcs, pkgs] = await Promise.all([fetchDjServicesAll(), fetchDjPackages()]);
      setServices(svcs);
      setPackages(pkgs);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadAll(); }, []);

  // ── KPI ────────────────────────────────────────────────────────────────────

  const activeServices = services.filter(s => s.active === 1);
  const stundensatzServices = activeServices.filter(s => s.unit === 'Stunde');
  const avgStundensatz = stundensatzServices.length > 0
    ? stundensatzServices.reduce((sum, s) => sum + s.price_net, 0) / stundensatzServices.length
    : 0;

  // ── Toggle ─────────────────────────────────────────────────────────────────

  async function handleToggle(service: DjService) {
    if (service.active === 1) {
      await deactivateDjService(service.id);
    } else {
      await updateDjService(service.id, { active: 1 });
    }
    await loadAll();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.5rem', color: 'var(--color-primary)' }}>inventory_2</span>
            <h1 style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: 'clamp(1.5rem, 3vw, 2rem)', letterSpacing: '-0.02em', color: 'var(--color-on-surface)' }}>
              Leistungen &amp; Pakete
            </h1>
          </div>
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem', fontFamily: 'var(--font-body)', marginLeft: '2.25rem' }}>
            Leistungskatalog und Buchungspakete verwalten
          </p>
        </div>

        {/* KPI-Karten */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
          <KpiCard label="Aktive Leistungen" value={String(activeServices.length)} icon="check_circle" />
          <KpiCard label="Pakete" value={String(packages.length)} icon="workspaces" />
          <KpiCard label="Ø Stundensatz" value={avgStundensatz > 0 ? formatCurrency(avgStundensatz) : '–'} icon="schedule" />
        </div>

        {/* Tab-Bar */}
        <div style={{ borderBottom: '1px solid var(--color-outline-variant)', marginBottom: '1.5rem', display: 'flex' }}>
          {(['leistungen', 'pakete'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
                padding: '0.75rem 1.5rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: '0.9rem',
                fontWeight: tab === t ? 600 : 400,
                color: tab === t ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                marginBottom: '-1px',
                transition: 'color 120ms',
              }}
            >
              {t === 'leistungen' ? 'Leistungen' : 'Pakete'}
            </button>
          ))}
        </div>

        {/* Ladeindikator */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
            Lade...
          </div>
        )}

        {/* ── Leistungen-Tab ───────────────────────────────────────────────── */}
        {!loading && tab === 'leistungen' && (
          <>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button type="button" style={btnPrimary} onClick={() => setServiceSlideOver(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
                Neue Leistung
              </button>
            </div>

            {/* Tabelle */}
            <div style={{ background: 'var(--color-surface-container)', borderRadius: '0.75rem', overflow: 'hidden' }}>
              {services.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                  Keine Leistungen vorhanden.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-surface-container-high)' }}>
                      {['Name', 'Kategorie', 'Einheit', 'Preis netto', 'MwSt', 'Status', 'Aktion'].map(col => (
                        <th key={col} style={{
                          padding: '0.75rem 1rem',
                          fontSize: '0.8rem',
                          color: 'var(--color-on-surface-variant)',
                          fontFamily: 'var(--font-body)',
                          fontWeight: 600,
                          textAlign: 'left',
                          whiteSpace: 'nowrap',
                        }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {services.map(s => (
                      <tr key={s.id} style={{ borderTop: '1px solid var(--color-outline-variant)' }}>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', color: 'var(--color-on-surface)', fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                          {s.name}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            background: 'var(--color-surface-container-high)',
                            borderRadius: '0.25rem',
                            padding: '0.15rem 0.5rem',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-body)',
                            color: 'var(--color-on-surface-variant)',
                          }}>
                            {s.category}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                          {s.unit}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', color: 'var(--color-on-surface)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                          {formatCurrency(s.price_net)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                          {s.tax_rate} %
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.625rem',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-body)',
                            fontWeight: 600,
                            background: s.active === 1
                              ? 'rgba(var(--color-primary-rgb, 204,151,255),0.15)'
                              : 'var(--color-surface-container-high)',
                            color: s.active === 1
                              ? 'var(--color-primary)'
                              : 'var(--color-on-surface-variant)',
                          }}>
                            {s.active === 1 ? 'Aktiv' : 'Inaktiv'}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <button
                            type="button"
                            onClick={() => void handleToggle(s)}
                            title={s.active === 1 ? 'Deaktivieren' : 'Aktivieren'}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--color-on-surface-variant)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.8rem',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.375rem',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>
                              {s.active === 1 ? 'toggle_on' : 'toggle_off'}
                            </span>
                            {s.active === 1 ? 'Deaktivieren' : 'Aktivieren'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ── Pakete-Tab ───────────────────────────────────────────────────── */}
        {!loading && tab === 'pakete' && (
          <>
            {/* Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
              <button type="button" style={btnPrimary} onClick={() => setPackageSlideOver(true)}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add</span>
                Neues Paket
              </button>
            </div>

            {/* Grid */}
            {packages.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)' }}>
                Keine Pakete vorhanden.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {packages.map(pkg => {
                  const grossPrice = pkg.price_net * (1 + pkg.tax_rate / 100);
                  return (
                    <div
                      key={pkg.id}
                      style={{
                        background: 'var(--color-surface-container)',
                        borderRadius: '0.75rem',
                        padding: '1.5rem',
                        border: '1px solid var(--color-outline-variant)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      {/* Name + Preis */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                            {pkg.name}
                          </div>
                          {pkg.description && (
                            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.825rem', color: 'var(--color-on-surface-variant)', marginTop: '0.25rem' }}>
                              {pkg.description}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontFamily: 'var(--font-headline)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)', lineHeight: 1 }}>
                            {formatCurrency(grossPrice)}
                          </div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-on-surface-variant)' }}>
                            inkl. {pkg.tax_rate} % MwSt
                          </div>
                        </div>
                      </div>

                      {/* Separator */}
                      <div style={{ borderTop: '1px solid var(--color-outline-variant)' }} />

                      {/* Enthaltene Leistungen */}
                      <div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', fontWeight: 600, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Enthaltene Leistungen
                        </div>
                        {pkg.services && pkg.services.length > 0 ? (
                          <ul style={{ margin: 0, padding: '0 0 0 1rem', listStyle: 'disc', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            {pkg.services.map(s => (
                              <li key={s.id} style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--color-on-surface)' }}>
                                {s.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', margin: 0 }}>
                            Keine Leistungen zugeordnet
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>

      {/* Slide-Overs */}
      {serviceSlideOver && (
        <ServiceSlideOver
          onClose={() => setServiceSlideOver(false)}
          onSaved={() => void loadAll()}
        />
      )}
      {packageSlideOver && (
        <PackageSlideOver
          services={services}
          onClose={() => setPackageSlideOver(false)}
          onSaved={() => void loadAll()}
        />
      )}
    </PageWrapper>
  );
}

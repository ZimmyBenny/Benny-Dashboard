/**
 * BelegeSettingsPage — /belege/einstellungen (Phase 04 Plan 10).
 *
 * Zentrale Konfigurations-UI fuer das Belege-Modul:
 *  - Allgemeine Einstellungen: 9 SettingRows (UStVA-Zeitraum, Ist-Versteuerung,
 *    Lead Days, Max Upload, OCR-Threshold, OCR-Engine, Kilometerpauschalen,
 *    Storage-Pfad)
 *  - Bereiche (Areas) CRUD: Liste mit Inline-Edit (name, color), Archivieren-
 *    Toggle, Neuer-Bereich-Form
 *  - Steuer-Kategorien CRUD: Liste mit Inline-Edit, Neuer-Kategorie-Form
 *  - Datenbank-Backup: Manueller Trigger via createBackup-Helper
 *
 * Save-Pattern: useMutation pro Section. Bei Settings: kompletter Form-State
 * wird auf Speichern-Klick gepatcht (Bulk-PATCH).
 *
 * Datenquelle: GET/PATCH /api/belege/settings + areas + tax-categories +
 * POST /api/belege/db-backup (alle Plan 04-10).
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  fetchBelegeSettings,
  updateBelegeSettings,
  fetchAreas,
  createArea,
  updateArea,
  fetchTaxCategories,
  createTaxCategory,
  triggerDbBackup,
  type Area,
  type TaxCategory,
} from '../../api/belege.api';

export function BelegeSettingsPage() {
  const qc = useQueryClient();
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['belege-settings'],
    queryFn: fetchBelegeSettings,
  });
  const { data: areas = [] } = useQuery({
    queryKey: ['areas'],
    queryFn: fetchAreas,
  });
  const { data: taxCats = [] } = useQuery({
    queryKey: ['tax-categories'],
    queryFn: fetchTaxCategories,
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const [backupResult, setBackupResult] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const updateMut = useMutation({
    mutationFn: updateBelegeSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['belege-settings'] });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    },
  });
  const createAreaMut = useMutation({
    mutationFn: createArea,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  });
  const updateAreaMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Area> }) =>
      updateArea(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['areas'] }),
  });
  const createTcMut = useMutation({
    mutationFn: createTaxCategory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tax-categories'] }),
  });
  const backupMut = useMutation({
    mutationFn: triggerDbBackup,
    onSuccess: (data) => {
      setBackupResult(data.path);
      setBackupError(null);
    },
    onError: (err) => {
      setBackupError((err as Error).message ?? 'Backup fehlgeschlagen');
      setBackupResult(null);
    },
  });

  if (settingsLoading || !settings) {
    return (
      <PageWrapper>
        <Container>
          <p style={textMuted}>Lädt …</p>
        </Container>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Container>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1
            style={{
              fontFamily: 'Manrope, sans-serif',
              fontWeight: 800,
              fontSize: '3rem',
              letterSpacing: '-0.02em',
              color: 'var(--color-primary)',
              margin: 0,
              lineHeight: 1.1,
              textTransform: 'uppercase',
            }}
          >
            EINSTELLUNGEN
          </h1>
          <p
            style={{
              color: 'var(--color-on-surface-variant)',
              fontSize: '0.9rem',
              margin: '0.5rem 0 0',
              fontFamily: 'var(--font-body)',
            }}
          >
            Belege-Konfiguration · Bereiche · Steuer-Kategorien · Datenbank-Backup
          </p>
        </div>

        {/* Allgemeine Einstellungen */}
        <Section title="Allgemeine Einstellungen">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '1rem',
            }}
          >
            <SettingRow label="UStVA-Zeitraum">
              <select
                value={form.ustva_zeitraum || 'keine'}
                onChange={(e) =>
                  setForm({ ...form, ustva_zeitraum: e.target.value })
                }
                style={inputStyle}
              >
                <option value="keine">Keine (Kleinunternehmer)</option>
                <option value="jahr">Jahr</option>
                <option value="quartal">Quartal</option>
                <option value="monat">Monat</option>
              </select>
            </SettingRow>

            <SettingRow label="Ist-Versteuerung">
              <select
                value={form.ist_versteuerung || 'true'}
                onChange={(e) =>
                  setForm({ ...form, ist_versteuerung: e.target.value })
                }
                style={inputStyle}
              >
                <option value="true">Ja (Standard)</option>
                <option value="false">Nein (Soll-Versteuerung)</option>
              </select>
            </SettingRow>

            <SettingRow label="Lead Days für Zahlungs-Tasks">
              <input
                type="number"
                min={0}
                value={form.payment_task_lead_days || '3'}
                onChange={(e) =>
                  setForm({ ...form, payment_task_lead_days: e.target.value })
                }
                style={inputStyle}
              />
            </SettingRow>

            <SettingRow label="Max Upload-Größe (MB)">
              <input
                type="number"
                min={1}
                value={form.max_upload_size_mb || '25'}
                onChange={(e) =>
                  setForm({ ...form, max_upload_size_mb: e.target.value })
                }
                style={inputStyle}
              />
            </SettingRow>

            <SettingRow label="OCR-Konfidenz-Schwelle (0..1)">
              <input
                type="number"
                step="0.01"
                min={0}
                max={1}
                value={form.ocr_confidence_threshold || '0.6'}
                onChange={(e) =>
                  setForm({
                    ...form,
                    ocr_confidence_threshold: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </SettingRow>

            <SettingRow label="OCR-Engine">
              <select
                value={form.ocr_engine || 'tesseract'}
                onChange={(e) =>
                  setForm({ ...form, ocr_engine: e.target.value })
                }
                style={inputStyle}
              >
                <option value="tesseract">tesseract.js</option>
                <option value="mock">mock (Test)</option>
              </select>
            </SettingRow>

            <SettingRow label="Kilometerpauschale Standard (Cent/km)">
              <input
                type="number"
                min={0}
                value={form.mileage_rate_default_per_km || '30'}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mileage_rate_default_per_km: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </SettingRow>

            <SettingRow label="Kilometerpauschale ab 21 km (Cent/km)">
              <input
                type="number"
                min={0}
                value={form.mileage_rate_above_20km_per_km || '38'}
                onChange={(e) =>
                  setForm({
                    ...form,
                    mileage_rate_above_20km_per_km: e.target.value,
                  })
                }
                style={inputStyle}
              />
            </SettingRow>

            <SettingRow label="Belege-Storage-Pfad (leer = Default)">
              <input
                value={form.belege_storage_path || ''}
                onChange={(e) =>
                  setForm({ ...form, belege_storage_path: e.target.value })
                }
                placeholder="~/.local/share/benny-dashboard/belege"
                style={inputStyle}
              />
            </SettingRow>
          </div>

          <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => updateMut.mutate(form)}
              disabled={updateMut.isPending}
              style={primaryBtnStyle(updateMut.isPending)}
            >
              {updateMut.isPending ? 'Speichert …' : 'Speichern'}
            </button>
            {savedFlash && (
              <span
                style={{
                  color: 'var(--color-secondary)',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-body)',
                }}
              >
                ✓ Gespeichert
              </span>
            )}
          </div>
        </Section>

        {/* Bereiche CRUD */}
        <Section title={`Bereiche (${areas.length})`}>
          <ul style={listResetStyle}>
            {areas.map((a) => (
              <AreaRow
                key={a.id}
                area={a}
                onUpdate={(data) => updateAreaMut.mutate({ id: a.id, data })}
              />
            ))}
            {areas.length === 0 && (
              <li style={{ ...textMuted, padding: '0.75rem 0' }}>
                Keine Bereiche vorhanden.
              </li>
            )}
          </ul>
          <NewAreaForm onCreate={(data) => createAreaMut.mutate(data)} />
        </Section>

        {/* Steuer-Kategorien CRUD */}
        <Section title={`Steuer-Kategorien (${taxCats.length})`}>
          <ul
            style={{
              ...listResetStyle,
              maxHeight: '20rem',
              overflowY: 'auto',
              border: '1px solid rgba(148,170,255,0.08)',
              borderRadius: '0.5rem',
              padding: '0.25rem 0.75rem',
            }}
          >
            {taxCats.map((c) => (
              <TaxCategoryRow key={c.id} tc={c} />
            ))}
            {taxCats.length === 0 && (
              <li style={{ ...textMuted, padding: '0.75rem 0' }}>
                Keine Steuer-Kategorien vorhanden.
              </li>
            )}
          </ul>
          <NewTaxCategoryForm onCreate={(data) => createTcMut.mutate(data)} />
        </Section>

        {/* Datenbank-Backup */}
        <Section title="Datenbank-Backup">
          <p style={{ ...textMuted, marginTop: 0, marginBottom: '0.75rem' }}>
            Erstellt eine Kopie der SQLite-DB unter
            <code
              style={{
                margin: '0 0.25rem',
                padding: '0.1rem 0.4rem',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '0.25rem',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
              }}
            >
              ~/.local/share/benny-dashboard/backups
            </code>
            mit Zeitstempel im Dateinamen. Empfohlen vor groesseren Aenderungen.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => backupMut.mutate()}
              disabled={backupMut.isPending}
              style={secondaryBtnStyle(backupMut.isPending)}
            >
              {backupMut.isPending ? 'Erstellt …' : 'DB-Backup jetzt erstellen'}
            </button>
            {backupResult && (
              <span
                style={{
                  color: 'var(--color-secondary)',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                }}
              >
                ✓ {backupResult}
              </span>
            )}
            {backupError && (
              <span
                style={{
                  color: 'var(--color-error)',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-body)',
                }}
              >
                Fehler: {backupError}
              </span>
            )}
          </div>
        </Section>
      </Container>
    </PageWrapper>
  );
}

// ── Sub-Components ─────────────────────────────────────────────────────────

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '2.5rem 2rem',
        position: 'relative',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '600px',
          height: '600px',
          background:
            'radial-gradient(circle at top right, rgba(148,170,255,0.06) 0%, transparent 60%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--color-surface-variant)',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        marginBottom: '1.5rem',
      }}
    >
      <h2
        style={{
          fontFamily: 'Manrope, sans-serif',
          fontSize: '1.15rem',
          fontWeight: 700,
          color: 'var(--color-on-surface)',
          margin: '0 0 1rem',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.375rem',
        fontFamily: 'var(--font-body)',
      }}
    >
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: 'var(--color-on-surface-variant)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function AreaRow({
  area,
  onUpdate,
}: {
  area: Area;
  onUpdate: (data: Partial<Area>) => void;
}) {
  const [name, setName] = useState(area.name);
  const [color, setColor] = useState(area.color);

  function commitName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== area.name) onUpdate({ name: trimmed });
  }
  function commitColor() {
    if (color !== area.color) onUpdate({ color });
  }

  return (
    <li
      style={{
        display: 'flex',
        gap: '0.5rem',
        padding: '0.5rem 0',
        borderBottom: '1px solid rgba(148,170,255,0.08)',
        alignItems: 'center',
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        style={{ ...inputStyle, flex: 1 }}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        onBlur={commitColor}
        style={{ width: '3rem', height: '2.25rem', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}
        aria-label="Farbe"
      />
      <button
        type="button"
        onClick={() => onUpdate({ archived: area.archived ? 0 : 1 })}
        style={{
          padding: '0.5rem 0.875rem',
          background: 'transparent',
          border: '1px solid rgba(148,170,255,0.2)',
          borderRadius: '0.5rem',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.8rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {area.archived ? 'Reaktivieren' : 'Archivieren'}
      </button>
    </li>
  );
}

function TaxCategoryRow({ tc }: { tc: TaxCategory }) {
  return (
    <li
      style={{
        padding: '0.5rem 0',
        borderBottom: '1px solid rgba(148,170,255,0.08)',
        fontSize: '0.85rem',
        fontFamily: 'var(--font-body)',
        color: 'var(--color-on-surface)',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
      }}
    >
      <strong style={{ flex: 1 }}>{tc.name}</strong>
      <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
        {tc.kind}
      </span>
      <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8rem', minWidth: '4rem', textAlign: 'right' }}>
        USt {tc.default_vat_rate ?? '–'}%
      </span>
    </li>
  );
}

function NewAreaForm({
  onCreate,
}: {
  onCreate: (d: { name: string; color: string }) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#94aaff');

  function submit() {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), color });
    setName('');
    setColor('#94aaff');
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        marginTop: '0.75rem',
        alignItems: 'center',
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Neuer Bereich …"
        style={{ ...inputStyle, flex: 1 }}
      />
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        style={{ width: '3rem', height: '2.25rem', padding: 0, border: 'none', cursor: 'pointer', borderRadius: '0.5rem' }}
        aria-label="Farbe"
      />
      <button
        type="button"
        onClick={submit}
        style={primaryBtnStyle(false)}
      >
        Hinzufügen
      </button>
    </div>
  );
}

function NewTaxCategoryForm({
  onCreate,
}: {
  onCreate: (d: {
    name: string;
    kind: 'einnahme' | 'ausgabe' | 'beides';
    default_vat_rate: number;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'einnahme' | 'ausgabe' | 'beides'>(
    'ausgabe',
  );
  const [vat, setVat] = useState(19);

  function submit() {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), kind, default_vat_rate: vat });
    setName('');
    setKind('ausgabe');
    setVat(19);
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        marginTop: '0.75rem',
        alignItems: 'center',
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Neue Kategorie …"
        style={{ ...inputStyle, flex: 1 }}
      />
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as 'einnahme' | 'ausgabe' | 'beides')}
        style={{ ...inputStyle, width: '8rem' }}
      >
        <option value="einnahme">Einnahme</option>
        <option value="ausgabe">Ausgabe</option>
        <option value="beides">Beides</option>
      </select>
      <input
        type="number"
        min={0}
        max={19}
        step={1}
        value={vat}
        onChange={(e) => setVat(parseInt(e.target.value, 10) || 0)}
        style={{ ...inputStyle, width: '5rem' }}
        aria-label="USt-Satz"
      />
      <button type="button" onClick={submit} style={primaryBtnStyle(false)}>
        Hinzufügen
      </button>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(148,170,255,0.15)',
  borderRadius: '0.5rem',
  color: 'var(--color-on-surface)',
  fontFamily: 'var(--font-body)',
  fontSize: '0.875rem',
  outline: 'none',
};

const listResetStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
};

const textMuted: React.CSSProperties = {
  color: 'var(--color-on-surface-variant)',
  fontSize: '0.9rem',
  fontFamily: 'var(--font-body)',
};

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled
      ? 'rgba(148,170,255,0.4)'
      : 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
    color: '#060e20',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.5rem 1.25rem',
    fontSize: '0.85rem',
    fontFamily: 'Manrope, sans-serif',
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    boxShadow: disabled ? 'none' : '0 0 12px rgba(148,170,255,0.3)',
    whiteSpace: 'nowrap',
  };
}

function secondaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    background: disabled ? 'rgba(92,253,128,0.4)' : 'var(--color-secondary)',
    color: '#000',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.5rem 1.25rem',
    fontSize: '0.85rem',
    fontFamily: 'Manrope, sans-serif',
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    whiteSpace: 'nowrap',
  };
}

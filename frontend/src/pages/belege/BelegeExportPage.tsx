/**
 * BelegeExportPage — /belege/export (Phase 04 Plan 10).
 *
 * CSV-Export der Belege mit Filtern (Jahr, Bereich, Kategorie). Backend liefert
 * UTF-8-CSV mit BOM (Excel-kompatibel). Download via Blob + Anchor-Click —
 * kein Re-Render-Trigger, kein State-Cleanup noetig.
 *
 * Kein ZIP, keine Ordnerstruktur — User-Vorgabe (siehe Plan-Context-Note).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchAreas, fetchTaxCategories } from '../../api/belege.api';
import apiClient from '../../api/client';

export function BelegeExportPage() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [area, setArea] = useState('');
  const [taxCatId, setTaxCatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: areas = [] } = useQuery({
    queryKey: ['areas'],
    queryFn: fetchAreas,
  });
  const { data: taxCats = [] } = useQuery({
    queryKey: ['tax-categories'],
    queryFn: fetchTaxCategories,
  });

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (year) params.set('year', year);
      if (area) params.set('area', area);
      if (taxCatId) params.set('tax_category_id', taxCatId);

      const response = await apiClient.get(
        `/belege/export-csv?${params.toString()}`,
        { responseType: 'blob' },
      );
      const url = window.URL.createObjectURL(response.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `belege-${year || 'all'}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message ?? 'Export fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageWrapper>
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

        <div style={{ position: 'relative', zIndex: 1 }}>
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
              EXPORT
            </h1>
            <p
              style={{
                color: 'var(--color-on-surface-variant)',
                fontSize: '0.9rem',
                margin: '0.5rem 0 0',
                fontFamily: 'var(--font-body)',
              }}
            >
              CSV-Export der Belege mit optionalen Filtern. Datei ist
              UTF-8-codiert mit BOM für direkte Excel-Kompatibilität.
            </p>
          </div>

          {/* Filterleiste */}
          <div
            style={{
              background: 'var(--color-surface-variant)',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.25rem',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              <FilterField label="Jahr">
                <input
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  placeholder="2026"
                  style={inputStyle}
                />
              </FilterField>
              <FilterField label="Bereich">
                <select
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Alle Bereiche</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Steuer-Kategorie">
                <select
                  value={taxCatId}
                  onChange={(e) => setTaxCatId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">Alle Kategorien</option>
                  {taxCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FilterField>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={handleDownload}
                disabled={loading}
                style={{
                  background: loading
                    ? 'rgba(148,170,255,0.4)'
                    : 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
                  color: '#060e20',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '0.625rem 1.25rem',
                  fontSize: '0.875rem',
                  fontFamily: 'Manrope, sans-serif',
                  fontWeight: 700,
                  cursor: loading ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  boxShadow: loading
                    ? 'none'
                    : '0 0 16px rgba(148,170,255,0.3)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '18px' }}
                >
                  download
                </span>
                {loading ? 'Lade …' : 'CSV herunterladen'}
              </button>
              {error && (
                <span
                  style={{
                    color: 'var(--color-error)',
                    fontSize: '0.85rem',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  Fehler: {error}
                </span>
              )}
            </div>
          </div>

          {/* Hinweis-Box */}
          <div
            style={{
              background: 'rgba(148,170,255,0.04)',
              border: '1px solid rgba(148,170,255,0.15)',
              borderRadius: '0.75rem',
              padding: '1rem 1.25rem',
              fontSize: '0.85rem',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: 'var(--color-on-surface)' }}>
              Spalten:
            </strong>{' '}
            id, type, receipt_date, due_date, payment_date, supplier_name,
            supplier_invoice_number, amount_gross_cents, amount_net_cents,
            vat_rate, vat_amount_cents, status, tax_category, reverse_charge,
            steuerrelevant.
            <br />
            Beträge sind in Cent (Integer). Für Steuerberater bzw. Excel-Import.
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

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

function FilterField({
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

/**
 * BelegeTaxPage — /belege/steuer (Phase 04 Plan 10).
 *
 * UStVA-Uebersicht abhaengig vom Setting `app_settings.ustva_zeitraum`:
 *  - 'keine'   → Hinweis "UStVA deaktiviert" (Kleinunternehmer)
 *  - 'jahr'    → 1 Bucket (Jahres-Aggregation, plus Vorjahr-Vergleich)
 *  - 'quartal' → 4 Buckets (Q1-Q4) als Tabelle mit Drilldown
 *  - 'monat'   → 12 Buckets (Jan-Dez) als Tabelle mit Drilldown
 *
 * Pro Bucket werden die UStVA-Kennzahlen angezeigt:
 *  KZ 81 (Umsatz 19% Netto), KZ 86 (Umsatz 7% Netto),
 *  KZ 66 (Vorsteuer), KZ 84/85 (Reverse-Charge), KZ 62 (EUSt), Zahllast.
 *
 * Drilldown: Klick auf Bucket-Zeile listet die zugrunde liegenden Belege
 * (steuerrelevant=1, status='bezahlt'/'teilbezahlt', payment_date im Bucket).
 *
 * Datenquelle: GET /api/belege/ustva + /api/belege/ustva-drill (Plan 04-10).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { fetchUstva, fetchUstvaDrill } from '../../api/belege.api';
import { ReceiptsTable } from './BelegeListPage';
import { formatCurrencyFromCents } from '../../lib/format';

const PERIOD_LABEL: Record<'jahr' | 'quartal' | 'monat', string> = {
  jahr: 'Jahr',
  quartal: 'Quartal',
  monat: 'Monat',
};

// Abgekuerzte Monatsspanne je Quartal (fuer die Zeitraum-Spalte).
const QUARTER_MONTHS: Record<number, string> = {
  1: 'Jan–Mär',
  2: 'Apr–Jun',
  3: 'Jul–Sep',
  4: 'Okt–Dez',
};

export function BelegeTaxPage() {
  const navigate = useNavigate();
  // Jahr in der URL persistieren, damit es beim Zurueck-Navigieren (navigate(-1))
  // erhalten bleibt statt auf das aktuelle Jahr zurueckzuspringen.
  const [searchParams, setSearchParams] = useSearchParams();
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const setYear = (y: number) => {
    const next = new URLSearchParams(searchParams);
    next.set('year', String(y));
    setSearchParams(next, { replace: true });
  };
  const [drillIdx, setDrillIdx] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ustva', year],
    queryFn: () => fetchUstva(year),
  });

  const { data: drillItems = [], isLoading: drillLoading } = useQuery({
    queryKey: ['ustva-drill', year, drillIdx],
    queryFn: () => fetchUstvaDrill(year, drillIdx ?? 0),
    enabled: drillIdx !== null,
  });

  if (isLoading || !data) {
    return (
      <PageWrapper>
        <Container>
          <p style={textMuted}>Lädt …</p>
        </Container>
      </PageWrapper>
    );
  }

  // ── 'keine' → Hinweis (Kleinunternehmer ohne UStVA-Pflicht) ─────────────
  if (data.period === 'keine') {
    return (
      <PageWrapper>
        <Container>
          <Header title="Steuer" subtitle="UStVA-Übersicht" />
          <div
            style={{
              background: 'var(--color-surface-variant)',
              borderRadius: '0.75rem',
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.5 }}
            >
              receipt_long
            </span>
            <p style={{ margin: 0, fontSize: '0.95rem' }}>
              UStVA ist deaktiviert. Setze in den{' '}
              <a
                href="/belege/einstellungen"
                style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
              >
                Einstellungen
              </a>{' '}
              einen UStVA-Zeitraum (Jahr / Quartal / Monat) — als Kleinunternehmer
              kannst du das ausgeschaltet lassen.
            </p>
          </div>
        </Container>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <Container>
        <Header
          title="Steuer"
          subtitle={`UStVA · ${PERIOD_LABEL[data.period]} · ${year}`}
          right={
            <YearPicker
              year={year}
              onChange={(y) => {
                setYear(y);
                setDrillIdx(null);
              }}
            />
          }
        />

        {/* Buckets-Tabelle */}
        <div
          style={{
            background: 'var(--color-surface-variant)',
            borderRadius: '0.75rem',
            overflow: 'hidden',
            marginBottom: '1.5rem',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <Th align="left">Zeitraum</Th>
                <Th align="right">KZ 81 (19% Netto)</Th>
                <Th align="right">KZ 66 (Vorsteuer)</Th>
                <Th align="right">KZ 84/85 (RC)</Th>
                <Th align="right">KZ 62 (EUSt)</Th>
                <Th align="right">Zahllast</Th>
              </tr>
            </thead>
            <tbody>
              {data.buckets.map((b) => {
                const active = drillIdx === b.period_index;
                return (
                  <tr
                    key={b.label}
                    onClick={() =>
                      setDrillIdx(active ? null : b.period_index)
                    }
                    style={{
                      cursor: 'pointer',
                      borderTop: '1px solid rgba(148,170,255,0.08)',
                      background: active ? 'rgba(148,170,255,0.06)' : 'transparent',
                      transition: 'background 120ms',
                    }}
                  >
                    <Td>
                      <strong>{b.label}</strong>
                      {data.period === 'quartal' && QUARTER_MONTHS[b.period_index] && (
                        <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.78rem', fontWeight: 400 }}>
                          {' · '}
                          {QUARTER_MONTHS[b.period_index]}
                        </span>
                      )}
                    </Td>
                    <Td align="right">
                      {formatCurrencyFromCents(b.kz81_umsatz_19_net_cents)}
                    </Td>
                    <Td align="right">
                      {formatCurrencyFromCents(b.kz66_vorsteuer_cents)}
                    </Td>
                    <Td align="right">
                      {formatCurrencyFromCents(b.kz84_rc_net_cents)} /{' '}
                      {formatCurrencyFromCents(b.kz85_rc_vat_cents)}
                    </Td>
                    <Td align="right">
                      {formatCurrencyFromCents(b.kz62_eust_cents)}
                    </Td>
                    <Td
                      align="right"
                      style={{
                        fontWeight: 700,
                        color:
                          b.zahllast_cents > 0
                            ? 'var(--color-error)'
                            : b.zahllast_cents < 0
                              ? 'var(--color-secondary)'
                              : 'var(--color-on-surface)',
                      }}
                    >
                      {formatCurrencyFromCents(b.zahllast_cents)}
                    </Td>
                  </tr>
                );
              })}
              {data.buckets.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      color: 'var(--color-on-surface-variant)',
                    }}
                  >
                    Keine Belege für dieses Jahr.
                  </td>
                </tr>
              )}
            </tbody>
            {data.buckets.length > 1 && (() => {
              const t = data.buckets.reduce(
                (a, b) => ({
                  kz81: a.kz81 + b.kz81_umsatz_19_net_cents,
                  kz86: a.kz86 + b.kz86_umsatz_7_net_cents,
                  kz66: a.kz66 + b.kz66_vorsteuer_cents,
                  kz84: a.kz84 + b.kz84_rc_net_cents,
                  kz85: a.kz85 + b.kz85_rc_vat_cents,
                  kz62: a.kz62 + b.kz62_eust_cents,
                  zahllast: a.zahllast + b.zahllast_cents,
                }),
                { kz81: 0, kz86: 0, kz66: 0, kz84: 0, kz85: 0, kz62: 0, zahllast: 0 },
              );
              return (
                <tfoot>
                  <tr style={{ borderTop: '2px solid rgba(148,170,255,0.25)', background: 'rgba(148,170,255,0.05)' }}>
                    <Td><strong>Gesamt {year}</strong></Td>
                    <Td align="right"><strong>{formatCurrencyFromCents(t.kz81)}</strong></Td>
                    <Td align="right"><strong>{formatCurrencyFromCents(t.kz66)}</strong></Td>
                    <Td align="right"><strong>{formatCurrencyFromCents(t.kz84)} / {formatCurrencyFromCents(t.kz85)}</strong></Td>
                    <Td align="right"><strong>{formatCurrencyFromCents(t.kz62)}</strong></Td>
                    <Td
                      align="right"
                      style={{
                        fontWeight: 700,
                        color:
                          t.zahllast > 0
                            ? 'var(--color-error)'
                            : t.zahllast < 0
                              ? 'var(--color-secondary)'
                              : 'var(--color-on-surface)',
                      }}
                    >
                      <strong>{formatCurrencyFromCents(t.zahllast)}</strong>
                    </Td>
                  </tr>
                </tfoot>
              );
            })()}
          </table>
        </div>

        {/* Drilldown */}
        {drillIdx !== null && (
          <section>
            <h2
              style={{
                fontFamily: 'Manrope, sans-serif',
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--color-on-surface)',
                margin: '0 0 0.75rem',
              }}
            >
              Drilldown ·{' '}
              {data.buckets.find((b) => b.period_index === drillIdx)?.label ??
                `Bucket ${drillIdx}`}
            </h2>
            <p style={{ ...textMuted, marginBottom: '0.75rem' }}>
              {drillLoading
                ? 'Lade …'
                : `${drillItems.length} ${drillItems.length === 1 ? 'Beleg' : 'Belege'} im Bucket (steuerrelevant, Ist-Versteuerung).`}
            </p>
            <ReceiptsTable
              items={drillItems}
              isLoading={drillLoading}
              onClick={(r) => navigate(`/belege/${r.id}`)}
            />
          </section>
        )}

        {/* Legende — erklaert die UStVA-Kennziffern (am Seitenende verankert) */}
        <div
          style={{
            background: 'var(--color-surface-variant)',
            borderRadius: '0.75rem',
            padding: '1rem 1.25rem',
            marginTop: 'auto',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--color-on-surface-variant)',
              margin: '0 0 0.6rem',
            }}
          >
            Legende — UStVA-Kennziffern
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
              gap: '0.5rem 1.25rem',
            }}
          >
            {[
              ['KZ 81', 'Netto-Umsätze zu 19 % (steuerpflichtige Einnahmen)'],
              ['KZ 86', 'Netto-Umsätze zu 7 % (ermäßigter Satz)'],
              ['KZ 66', 'Vorsteuer — USt aus Eingangsrechnungen, die du dir zurückholst'],
              ['KZ 84/85', 'Reverse Charge (§13b) — du schuldest die Steuer, z. B. Ausland'],
              ['KZ 62', 'Einfuhrumsatzsteuer (EUSt) — bei Warenimporten (z. B. Amazon FBA)'],
              ['Zahllast', 'Vereinnahmte USt minus Vorsteuer = Betrag ans Finanzamt'],
            ].map(([kz, desc]) => (
              <div key={kz} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: 'var(--color-primary)',
                    whiteSpace: 'nowrap',
                    minWidth: '3.75rem',
                  }}
                >
                  {kz}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.78rem',
                    color: 'var(--color-on-surface-variant)',
                    lineHeight: 1.35,
                  }}
                >
                  {desc}
                </span>
              </div>
            ))}
          </div>
        </div>
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
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
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
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', flex: 1 }}>{children}</div>
    </div>
  );
}

function Header({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '2rem',
        gap: '1rem',
        flexWrap: 'wrap',
      }}
    >
      <div>
        <h1
          style={{
            fontFamily: 'Manrope, sans-serif',
            fontWeight: 800,
            fontSize: '3rem',
            letterSpacing: '-0.02em',
            color: 'var(--color-on-surface)',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {title}
        </h1>
        <p
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: '0.9rem',
            margin: '0.5rem 0 0',
            fontFamily: 'var(--font-body)',
          }}
        >
          {subtitle}
        </p>
      </div>
      {right}
    </div>
  );
}

function YearPicker({
  year,
  onChange,
}: {
  year: number;
  onChange: (year: number) => void;
}) {
  return (
    <input
      type="number"
      value={year}
      onChange={(e) => {
        const next = parseInt(e.target.value, 10);
        if (Number.isFinite(next)) onChange(next);
      }}
      aria-label="Jahr"
      style={{
        width: '7rem',
        padding: '0.5rem 0.75rem',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(148,170,255,0.15)',
        borderRadius: '0.5rem',
        color: 'var(--color-on-surface)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.9rem',
        outline: 'none',
      }}
    />
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <th
      style={{
        padding: '0.75rem 1rem',
        textAlign: align,
        fontSize: '0.7rem',
        fontWeight: 600,
        color: 'var(--color-on-surface-variant)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  style,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={{
        padding: '0.75rem 1rem',
        textAlign: align,
        fontSize: '0.9rem',
        color: 'var(--color-on-surface)',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </td>
  );
}

const textMuted: React.CSSProperties = {
  color: 'var(--color-on-surface-variant)',
  fontSize: '0.9rem',
  fontFamily: 'var(--font-body)',
};

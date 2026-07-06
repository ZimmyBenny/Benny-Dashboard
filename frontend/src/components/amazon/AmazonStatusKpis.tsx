import type { AmazonDashboard } from '../../api/amazon.api';

interface Props {
  counts: AmazonDashboard['counts'];
  onNavigate: () => void;
}

interface KpiDef {
  key: keyof AmazonDashboard['counts'];
  label: string;
  icon: string;
  color: string;
}

const KPIS: KpiDef[] = [
  { key: 'interessant', label: 'Interessant', icon: 'lightbulb',    color: 'var(--color-primary)' },
  { key: 'warteliste',  label: 'Warteliste',  icon: 'schedule',      color: 'var(--color-tertiary)' },
  { key: 'aktiv',       label: 'Aktiv',       icon: 'rocket_launch', color: 'var(--color-secondary)' },
  { key: 'bestehend',   label: 'Bestehend',   icon: 'inventory_2',   color: 'var(--color-tertiary)' },
  { key: 'verworfen',   label: 'Verworfen',   icon: 'block',         color: 'var(--color-outline)' },
];

export function AmazonStatusKpis({ counts, onNavigate }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '0.625rem',
        marginBottom: '1.75rem',
      }}
      className="amazon-kpi-grid"
    >
      {KPIS.map((kpi) => (
        <button
          key={kpi.key}
          onClick={onNavigate}
          style={{
            background: 'var(--color-surface-container)',
            border: '1px solid rgba(148,170,255,0.16)',
            borderRadius: '0.75rem',
            padding: '1rem 1.125rem',
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: '0.875rem',
            transition: 'border-color 150ms ease, background 150ms ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(148,170,255,0.30)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container-high)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(148,170,255,0.16)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container)';
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '1.375rem', color: kpi.color, flexShrink: 0 }}
          >
            {kpi.icon}
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.75rem',
              color: 'var(--color-on-surface)', margin: 0, lineHeight: 1,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {counts[kpi.key]}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '0.65rem', textTransform: 'uppercase',
              letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: 0, marginTop: '0.25rem',
            }}>
              {kpi.label}
            </p>
          </div>
        </button>
      ))}

      <style>{`
        @media (min-width: 640px) {
          .amazon-kpi-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

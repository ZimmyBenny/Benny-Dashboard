interface KPICardProps {
  label: string;
  value: string | number;
  icon: string;
  sublabel?: string;
  accentColor?: 'primary' | 'secondary' | 'tertiary' | 'error';
  onClick?: () => void;
}

const accentColors = {
  primary:   'var(--color-primary)',
  secondary: 'var(--color-secondary)',
  tertiary:  'var(--color-tertiary)',
  error:     'var(--color-error)',
};

export function KPICard({ label, value, icon, sublabel, accentColor = 'primary', onClick }: KPICardProps) {
  const color = accentColors[accentColor];
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--color-surface-container)',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-container-high)'; }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-container)'; }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          position: 'absolute', top: '1.25rem', right: '1.25rem',
          fontSize: '22px', color,
        }}
      >
        {icon}
      </span>

      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.7rem',
        fontWeight: 500,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--color-on-surface-variant)',
        marginBottom: '0.5rem',
      }}>
        {label}
      </p>

      <p style={{
        fontFamily: 'var(--font-headline)',
        fontSize: '1.875rem',
        fontWeight: 700,
        color: accentColor === 'primary' ? 'var(--color-on-surface)' : color,
        lineHeight: 1,
        marginBottom: sublabel ? '0.375rem' : 0,
      }}>
        {value}
      </p>

      {sublabel && (
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.75rem',
          color: 'var(--color-on-surface-variant)',
        }}>
          {sublabel}
        </p>
      )}
    </div>
  );
}

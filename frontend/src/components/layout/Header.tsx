import { useLocation } from 'react-router-dom';
import { pageNames } from './navConfig';

export function Header() {
  const location = useLocation();
  const pageName = pageNames[location.pathname] ?? location.pathname;

  return (
    <header
      className="flex items-center justify-between flex-shrink-0"
      style={{
        height: '56px',
        padding: '0 1.5rem',
        backgroundColor: 'var(--color-surface-container-low)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <span style={{
        fontFamily: 'var(--font-body)',
        fontSize: '0.7rem',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--color-outline)',
      }}>
        Benny Dashboard
      </span>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          fontFamily: 'var(--font-headline)',
          fontWeight: 700,
          fontSize: '0.8125rem',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-on-surface)',
        }}>
          {pageName}
        </span>
        <span style={{
          display: 'inline-block',
          width: '5px', height: '5px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
          boxShadow: '0 0 8px rgba(204,151,255,0.7)',
        }} />
      </div>
    </header>
  );
}

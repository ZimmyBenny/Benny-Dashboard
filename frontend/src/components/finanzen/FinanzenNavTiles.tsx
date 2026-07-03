import { useNavigate } from 'react-router-dom';

interface Tile {
  path: string;
  label: string;
  icon: string;
}

const TILES: Tile[] = [
  { path: '/finances/bewertungen',       label: 'Bewertungen',       icon: 'reviews' },
  { path: '/finances/steuer-checkliste', label: 'Steuer-Checkliste', icon: 'checklist' },
  { path: '/haushalt',                   label: 'Haushalt',          icon: 'family_restroom' },
];

export function FinanzenNavTiles() {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.625rem' }}>
      {TILES.map((tile) => (
        <button
          key={tile.path}
          className="module-card"
          onClick={() => navigate(tile.path)}
          style={{ width: '190px', textAlign: 'left', padding: '1rem 1.125rem', cursor: 'pointer' }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{
            position: 'absolute', bottom: '0.25rem', right: '0.5rem',
            fontSize: '2.75rem', lineHeight: 1, color: 'var(--color-primary)', opacity: 0.06, pointerEvents: 'none',
          }}>
            {tile.icon}
          </span>
          <div style={{ position: 'relative', zIndex: 1 }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: 'var(--color-primary)', display: 'block', marginBottom: '0.5rem' }}>
              {tile.icon}
            </span>
            <p style={{
              fontFamily: 'var(--font-headline)', fontWeight: 700, fontSize: '0.75rem',
              letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface)', margin: 0,
            }}>
              {tile.label}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

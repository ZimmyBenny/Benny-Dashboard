import { useState } from 'react';
import { type BrandCandidate } from '../../api/amazon.api';
import { BrandFavoriteCard } from './BrandFavoriteCard';

interface Props {
  productId: number;
  candidates: BrandCandidate[];
}

const STORAGE_KEY = 'amazon.brand.favoritesPanel.expanded';

export function BrandFavoritesPanel({ productId, candidates }: Props) {
  const favorites = candidates.filter(c => c.is_favorite === 1 && c.is_archived === 0);

  const [expanded, setExpanded] = useState<boolean>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return v === null ? true : v === '1';
  });

  function toggle() {
    setExpanded(prev => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  if (favorites.length === 0) return null;

  return (
    <div className="px-5 pb-5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 text-left cursor-pointer select-none"
        style={{ color: 'var(--color-on-surface)' }}
      >
        <span className="material-symbols-outlined text-base" style={{ color: '#fbbf24' }}>star</span>
        <h3 className="text-sm font-semibold flex-1">
          Recherche
          <span
            className="ml-2 px-2 py-0.5 rounded-full text-xs"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
          >
            {favorites.length}
          </span>
        </h3>
        <span
          className="material-symbols-outlined transition-transform"
          style={{
            color: 'var(--color-on-surface-variant)',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          expand_more
        </span>
      </button>
      {expanded && (
        <>
          <p className="text-xs mt-1 mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
            Prüfe Markenrecht, Domains und Social-Media-Handles für deine Favoriten.
          </p>
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            {favorites.map(c => (
              <BrandFavoriteCard key={c.id} productId={productId} candidate={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { type BrandCandidate } from '../../api/amazon.api';
import { BrandFavoriteCard } from './BrandFavoriteCard';

interface Props {
  productId: number;
  candidates: BrandCandidate[];
}

export function BrandFavoritesPanel({ productId, candidates }: Props) {
  const favorites = candidates.filter(c => c.is_favorite === 1 && c.is_archived === 0);
  if (favorites.length === 0) return null;

  return (
    <div className="px-5 pb-5">
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
        <span className="material-symbols-outlined text-base" style={{ color: '#fbbf24' }}>star</span>
        Recherche
      </h3>
      <p className="text-xs mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
        Prüfe Markenrecht, Domains und Social-Media-Handles für deine Favoriten.
      </p>
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        {favorites.map(c => (
          <BrandFavoriteCard key={c.id} productId={productId} candidate={c} />
        ))}
      </div>
    </div>
  );
}

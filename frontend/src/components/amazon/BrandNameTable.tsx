import { useMemo, useState } from 'react';
import { type BrandCandidate, type BrandName } from '../../api/amazon.api';
import { useCreateCandidate } from '../../hooks/amazon/useBrand';
import { BrandNameRow } from './BrandNameRow';
import { DeleteBrandNameDialog } from './DeleteBrandNameDialog';

const CANDIDATE_LIMIT = 100;

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--color-on-surface-variant)',
  padding: '8px',
  whiteSpace: 'nowrap',
};

interface Props {
  productId: number;
  brand: BrandName;
  candidates: BrandCandidate[];
  onExportPdf: () => void;
}

function sortFavoritesFirst(list: BrandCandidate[]): BrandCandidate[] {
  return [...list].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return b.is_favorite - a.is_favorite;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export function BrandNameTable({ productId, candidates, onExportPdf }: Props) {
  const create = useCreateCandidate(productId);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrandCandidate | null>(null);
  const [newName, setNewName] = useState('');

  const archivedCount = candidates.filter(c => c.is_archived === 1).length;
  const atLimit = candidates.length >= CANDIDATE_LIMIT;

  const visibleSorted = useMemo(() => {
    const filtered = showArchived ? candidates : candidates.filter(c => c.is_archived === 0);
    return sortFavoritesFirst(filtered);
  }, [candidates, showArchived]);

  const parsedNames = useMemo(
    () => newName.split(',').map(s => s.trim()).filter(s => s.length > 0 && s.length <= 200),
    [newName],
  );
  const remainingSlots = Math.max(0, CANDIDATE_LIMIT - candidates.length);
  const willAdd = Math.min(parsedNames.length, remainingSlots);

  const existingLower = useMemo(
    () => new Set(candidates.map(c => c.name.toLowerCase())),
    [candidates],
  );
  const duplicates = useMemo(
    () => parsedNames.filter(n => existingLower.has(n.toLowerCase())),
    [parsedNames, existingLower],
  );

  async function handleAdd() {
    if (willAdd <= 0) return;
    const toAdd = parsedNames.slice(0, willAdd);
    for (const name of toAdd) {
      try {
        await create.mutateAsync(name);
      } catch {
        // einzelne Fehler (z.B. Limit-Verletzung) ueberspringen, weitere versuchen
      }
    }
    setNewName('');
  }

  return (
    <div className="px-5 pb-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
          <span className="material-symbols-outlined text-base">list</span>
          Namensliste
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2"
            style={{
              background: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span className="material-symbols-outlined text-base">archive</span>
            {showArchived ? 'Archivierte ausblenden' : 'Archivierte einblenden'}
            <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#fdba7433', color: '#fdba74' }}>
              {archivedCount}
            </span>
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            disabled={candidates.filter(c => c.is_archived === 0).length === 0}
            className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            <span className="material-symbols-outlined text-base">picture_as_pdf</span>
            PDF exportieren
          </button>
        </div>
      </div>

      {/* Tabelle */}
      {visibleSorted.length === 0 ? (
        <p
          className="text-sm text-center py-6 rounded-md"
          style={{ color: 'var(--color-on-surface-variant)', background: 'var(--color-surface-container-low)' }}
        >
          Noch keine Namen — unten einen ersten Vorschlag eintragen.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '800px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={TH_STYLE}>Name</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Interessant</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Vielleicht</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Ja</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Nein</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>★ Favourit</th>
                <th style={TH_STYLE}>Bemerkungen</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Archiv</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleSorted.map(c => (
                <BrandNameRow
                  key={c.id}
                  productId={productId}
                  candidate={c}
                  onRequestDelete={setPendingDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add-Form */}
      <div className="mt-4 flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            disabled={atLimit}
            placeholder="Neuer Markenname … (mehrere durch Komma trennen)"
            className="w-full px-3 py-2 rounded-md text-sm"
            style={{
              background: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />
          {parsedNames.length > 1 && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
              {willAdd === parsedNames.length
                ? `${willAdd} Namen werden angelegt.`
                : `Nur ${willAdd} von ${parsedNames.length} Namen passen ins Limit (${remainingSlots} frei).`}
              {duplicates.length > 0 && ` ${duplicates.length} Duplikat${duplicates.length === 1 ? '' : 'e'} dabei.`}
            </p>
          )}
          {parsedNames.length === 1 && duplicates.length === 1 && (
            <p className="text-xs mt-1" style={{ color: '#fdba74' }}>
              Name „{duplicates[0]}" existiert bereits.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={willAdd <= 0 || create.isPending}
          className="px-3 py-2 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
          style={{
            background: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          title={atLimit ? `Maximal ${CANDIDATE_LIMIT} Namen pro Produkt` : undefined}
        >
          <span className="material-symbols-outlined text-base">add</span>
          {parsedNames.length > 1 ? `${willAdd} Namen hinzufügen` : 'Name hinzufügen'}
        </button>
      </div>

      <DeleteBrandNameDialog
        productId={productId}
        candidate={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

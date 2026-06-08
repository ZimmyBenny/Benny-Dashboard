import { useEffect, useMemo, useState } from 'react';
import { type BrandCandidate, type BrandName } from '../../api/amazon.api';
import { useCreateCandidate } from '../../hooks/amazon/useBrand';
import { BrandNameRow } from './BrandNameRow';
import { DeleteBrandNameDialog } from './DeleteBrandNameDialog';

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--color-on-surface-variant)',
  padding: '8px',
  whiteSpace: 'nowrap',
  position: 'sticky',
  top: 0,
  background: 'var(--color-surface-container-low)',
  zIndex: 1,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

interface Props {
  productId: number;
  brand: BrandName;
  candidates: BrandCandidate[];
  onExportPdf: () => void;
}

// Sortier-Score:
//   3⭐ → 300, 2⭐ → 200, 1⭐ → 100
//   + FAV +50, Interessant +20
//   archiviert ist standardmaessig ausgeblendet (eigener Toggle).
function scoreOf(c: BrandCandidate): number {
  const ranking = (c.ranking ?? 0) * 100;
  return ranking + c.is_favorite * 50 + c.is_interesting * 20;
}

function sortByScore(list: BrandCandidate[]): BrandCandidate[] {
  return [...list].sort((a, b) => {
    const sa = scoreOf(a);
    const sb = scoreOf(b);
    if (sa !== sb) return sb - sa; // hoeherer Score zuerst
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export function BrandNameTable({ productId, candidates, onExportPdf }: Props) {
  const create = useCreateCandidate(productId);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrandCandidate | null>(null);
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');

  const archivedCount = candidates.filter(c => c.is_archived === 1).length;
  const activeCount = candidates.filter(c => c.is_archived === 0).length;

  // Stabile Sortierung: Reihenfolge bleibt bei Status-Klicks unveraendert.
  // Neu sortiert wird nur bei Add/Delete oder manuellem 'Sortieren'-Klick.
  const [orderedIds, setOrderedIds] = useState<number[]>(
    () => sortByScore(candidates).map(c => c.id),
  );

  useEffect(() => {
    const known = new Set(orderedIds);
    const current = new Set(candidates.map(c => c.id));
    const sameSet = known.size === current.size && [...current].every(id => known.has(id));
    if (sameSet) return;
    // Add oder Delete: einmalig neu sortieren
    setOrderedIds(sortByScore(candidates).map(c => c.id));
  }, [candidates, orderedIds]);

  function resort() {
    setOrderedIds(sortByScore(candidates).map(c => c.id));
  }

  const visibleSorted = useMemo(() => {
    const byId = new Map(candidates.map(c => [c.id, c]));
    const inOrder = orderedIds
      .map(id => byId.get(id))
      .filter((c): c is BrandCandidate => Boolean(c));
    // Falls neue IDs noch nicht im sortierten Cache sind, ans Ende anhaengen.
    const inOrderSet = new Set(orderedIds);
    const extras = candidates.filter(c => !inOrderSet.has(c.id));
    let merged: BrandCandidate[] = [...inOrder, ...extras];

    const q = search.trim().toLowerCase();
    if (!showArchived) merged = merged.filter(c => c.is_archived === 0);
    if (q.length > 0) {
      merged = merged.filter(c =>
        c.name.toLowerCase().includes(q) || (c.remarks ?? '').toLowerCase().includes(q),
      );
    }
    return merged;
  }, [candidates, orderedIds, showArchived, search]);

  const existingLower = useMemo(
    () => new Set(candidates.map(c => c.name.toLowerCase())),
    [candidates],
  );

  // Parsed and DEDUPLICATED list: drops names that already exist + drops within-input duplicates.
  const { uniqueNew, skippedDuplicates } = useMemo(() => {
    const raw = newName.split(',').map(s => s.trim()).filter(s => s.length > 0 && s.length <= 200);
    const seenInInput = new Set<string>();
    const unique: string[] = [];
    const skipped: string[] = [];
    for (const n of raw) {
      const low = n.toLowerCase();
      if (seenInInput.has(low) || existingLower.has(low)) {
        skipped.push(n);
        continue;
      }
      seenInInput.add(low);
      unique.push(n);
    }
    return { uniqueNew: unique, skippedDuplicates: skipped };
  }, [newName, existingLower]);

  const willAdd = uniqueNew.length;

  async function handleAdd() {
    if (willAdd === 0) return;
    for (const name of uniqueNew) {
      try {
        await create.mutateAsync(name);
      } catch {
        // einzelne Fehler ueberspringen, weitere versuchen
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
          <span
            className="px-2 py-0.5 rounded-full text-xs"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
            title={`${activeCount} aktiv, ${archivedCount} archiviert`}
          >
            {activeCount}
          </span>
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <span
              className="material-symbols-outlined text-base absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-on-surface-variant)', fontSize: '16px' }}
            >
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setSearch(''); }}
              placeholder="Suchen …"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="pl-7 pr-7 py-1.5 rounded-md text-sm"
              style={{
                background: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface)',
                border: '1px solid rgba(255,255,255,0.08)',
                minWidth: '180px',
              }}
            />
            {search.length > 0 && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Suche zuruecksetzen"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/10"
                style={{ color: 'var(--color-on-surface-variant)' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={resort}
            className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2"
            style={{
              background: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            title="Liste neu sortieren (Sterne und Status entscheiden ueber die Reihenfolge)"
          >
            <span className="material-symbols-outlined text-base">sort</span>
            Sortieren
          </button>
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
            disabled={activeCount === 0}
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
          {search.trim().length > 0
            ? `Kein Name passt zu „${search.trim()}".`
            : 'Noch keine Namen — unten einen ersten Vorschlag eintragen.'}
        </p>
      ) : (
        <div className="overflow-auto rounded-md" style={{ maxHeight: '60vh' }}>
          <table className="w-full" style={{ minWidth: '800px' }}>
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, textAlign: 'right', width: 36 }}>#</th>
                <th style={TH_STYLE}>Name</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Interessant</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>★ Favourit</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Archiv</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Marke</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Ranking</th>
                <th style={TH_STYLE}>Bemerkungen</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleSorted.map((c, idx) => (
                <BrandNameRow
                  key={c.id}
                  productId={productId}
                  candidate={c}
                  rowNumber={idx + 1}
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
            placeholder="Neuer Markenname … (mehrere durch Komma trennen)"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full px-3 py-2 rounded-md text-sm"
            style={{
              background: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />
          {(willAdd > 0 || skippedDuplicates.length > 0) && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)' }}>
              {willAdd > 0 && `${willAdd} neue${willAdd === 1 ? 'r' : ''} Name${willAdd === 1 ? '' : 'n'} wird angelegt.`}
              {skippedDuplicates.length > 0 && (
                <span style={{ color: '#fdba74' }}>
                  {willAdd > 0 ? ' ' : ''}
                  {skippedDuplicates.length} Duplikat{skippedDuplicates.length === 1 ? '' : 'e'} {skippedDuplicates.length === 1 ? 'wird' : 'werden'} übersprungen.
                </span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={willAdd === 0 || create.isPending}
          className="px-3 py-2 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
          style={{
            background: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span className="material-symbols-outlined text-base">add</span>
          {willAdd > 1 ? `${willAdd} Namen hinzufügen` : 'Name hinzufügen'}
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

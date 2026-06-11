import { useRef, useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { type SteuerCategory, exportSteuerPdf, exportSteuerZip } from '../../api/steuer.api';
import {
  useSteuerJahre,
  useSteuer,
  useCreateSteuerCategory,
  useDeleteSteuerCategory,
  useReorderSteuerCategories,
  useCopySteuerYear,
} from '../../hooks/finanzen/useSteuer';
import { SteuerCategoryBlock } from '../../components/finanzen/SteuerCategoryBlock';

const ACCENT = '#60a5fa';

function DeleteCategoryDialog({ name, onConfirm, onClose }: { name: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl p-5 w-[90%] max-w-sm"
        style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-4" style={{ color: 'var(--color-on-surface)' }}>
          Überbegriff „{name || 'Überbegriff'}" wird dauerhaft gelöscht — inklusive aller Punkte und Dokumente.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => { onConfirm(); onClose(); }}
            className="px-3 py-1.5 rounded-md text-sm"
            style={{ background: '#7f1d1d', color: '#fecaca' }}
          >
            Löschen
          </button>
        </div>
      </div>
    </div>
  );
}

export function TaxChecklistPage() {
  const currentYear = new Date().getFullYear();
  const [jahr, setJahr] = useState(() => currentYear);
  const [pendingDelete, setPendingDelete] = useState<SteuerCategory | null>(null);
  const [catOrder, setCatOrder] = useState<number[] | null>(null);
  const [newYearInput, setNewYearInput] = useState('');
  const [copyFromYear, setCopyFromYear] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);
  const dragCatIndex = useRef<number | null>(null);

  function toggleSelect(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function runExport(format: 'pdf' | 'zip', ids: number[] | 'all') {
    setExporting(true);
    try {
      const blob = format === 'pdf' ? await exportSteuerPdf(jahr, ids) : await exportSteuerZip(jahr, ids);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `Steuer-${jahr}.${format}`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally { setExporting(false); }
  }

  const { data: jahreData } = useSteuerJahre();
  const { data, isLoading, isError, refetch } = useSteuer(jahr);
  const createCat = useCreateSteuerCategory(jahr);
  const deleteCat = useDeleteSteuerCategory(jahr);
  const reorderCats = useReorderSteuerCategories(jahr);
  const copySteuerYear = useCopySteuerYear(jahr);

  // Jahr-Optionen: alle bekannten Jahre + aktuelles Jahr + selektiertes Jahr, absteigend
  const jahreOptions = Array.from(new Set([...(jahreData ?? []), currentYear, jahr])).sort((a, b) => b - a);

  // Quell-Jahre für „Struktur übernehmen": alle bekannten Jahre außer dem aktuellen, absteigend
  const quellJahre = (jahreData ?? []).filter(j => j !== jahr).sort((a, b) => b - a);
  const vorjahr = quellJahre[0] ?? null;
  const effektivQuelle = (copyFromYear !== null && quellJahre.includes(copyFromYear)) ? copyFromYear : vorjahr;

  // Drag-Reorder für Kategorien
  const catIds = catOrder ?? (data?.categories.map(c => c.id) ?? []);
  const catById = new Map(data?.categories.map(c => [c.id, c]) ?? []);
  const orderedCats = catIds.map(id => catById.get(id)).filter(Boolean) as SteuerCategory[];

  function catDown(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragCatIndex.current = idx;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!catOrder && data) setCatOrder(data.categories.map(c => c.id));
  }
  function catEnter(idx: number) {
    if (dragCatIndex.current === null || dragCatIndex.current === idx) return;
    setCatOrder(prev => {
      const arr = [...(prev ?? (data?.categories.map(c => c.id) ?? []))];
      const [moved] = arr.splice(dragCatIndex.current as number, 1);
      arr.splice(idx, 0, moved);
      dragCatIndex.current = idx;
      return arr;
    });
  }
  function catUp() {
    if (dragCatIndex.current !== null && catOrder) {
      reorderCats.mutate(catOrder, { onSettled: () => setCatOrder(null) });
    }
    dragCatIndex.current = null;
  }

  function openYear() {
    const y = parseInt(newYearInput, 10);
    if (Number.isInteger(y) && y >= 1990 && y <= 2100) { setJahr(y); setCatOrder(null); setNewYearInput(''); setSelectedIds(new Set()); }
  }

  return (
    <PageWrapper>
      {/* Header */}
      <header className="flex items-center gap-4 mb-6">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--color-surface-container)' }}
        >
          <span className="material-symbols-outlined" style={{ color: ACCENT }}>checklist</span>
        </div>
        <h1
          className="flex-1 min-w-0 text-2xl font-bold"
          style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
        >
          Steuer-Checkliste
        </h1>
      </header>

      {/* Jahr-Wähler */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <select
          value={jahr}
          onChange={(e) => { setJahr(Number(e.target.value)); setCatOrder(null); setSelectedIds(new Set()); }}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {jahreOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <input
          type="number"
          value={newYearInput}
          onChange={(e) => setNewYearInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') openYear(); }}
          placeholder="Jahr, z. B. 2024"
          className="px-3 py-1.5 rounded-md text-sm w-36"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <button
          type="button"
          onClick={openYear}
          className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>Jahr öffnen
        </button>
      </div>

      {/* Lade- und Fehlerzustände */}
      {isLoading && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Steuer-Checkliste …</p>
        </div>
      )}

      {isError && !isLoading && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>Checkliste konnte nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            Erneut laden
          </button>
        </div>
      )}

      {!isLoading && !isError && data && (
        <div className="flex flex-col gap-4">
          {/* Leer-Zustand: Struktur übernehmen */}
          {data.categories.length === 0 && vorjahr !== null && (
            <div
              className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--color-on-surface-variant)' }}>content_copy</span>
              <span className="text-sm flex-1" style={{ color: 'var(--color-on-surface-variant)' }}>
                Noch keine Überbegriffe für {jahr}.
              </span>
              <span className="text-sm flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }}>Vorlage:</span>
              <select
                value={effektivQuelle ?? ''}
                onChange={(e) => setCopyFromYear(Number(e.target.value))}
                className="px-2 py-1.5 rounded-md text-sm flex-shrink-0"
                style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {quellJahre.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button
                type="button"
                onClick={() => { if (effektivQuelle !== null) copySteuerYear.mutate({ fromJahr: effektivQuelle, toJahr: jahr }); }}
                disabled={copySteuerYear.isPending || effektivQuelle === null}
                className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 flex-shrink-0"
                style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', opacity: (copySteuerYear.isPending || effektivQuelle === null) ? 0.6 : 1 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_copy</span>
                Struktur übernehmen
              </button>
            </div>
          )}

          {data.categories.length === 0 && vorjahr === null && (
            <div
              className="rounded-xl p-5"
              style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                Noch keine Überbegriffe für {jahr}. Füge den ersten Überbegriff hinzu.
              </p>
            </div>
          )}

          {/* Export-Leiste */}
          {data.categories.length > 0 && (
            <div
              className="flex flex-col gap-3 rounded-xl px-4 py-3"
              style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium mr-1" style={{ color: 'var(--color-on-surface)' }}>Export</span>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(data.categories.flatMap(c => c.items.map(i => i.id))))}
                  className="px-3 py-1.5 rounded-md text-sm flex-shrink-0"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  Alle anhaken
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={selectedIds.size === 0}
                  className="px-3 py-1.5 rounded-md text-sm flex-shrink-0"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', opacity: selectedIds.size === 0 ? 0.5 : 1 }}
                >
                  Auswahl aufheben
                </button>
                <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', display: 'inline-block', margin: '0 4px' }} />
                <button
                  type="button"
                  onClick={() => runExport('pdf', Array.from(selectedIds))}
                  disabled={selectedIds.size === 0 || exporting}
                  className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 flex-shrink-0"
                  style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', opacity: (selectedIds.size === 0 || exporting) ? 0.5 : 1 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>
                  {exporting ? 'Erstelle …' : `PDF erstellen (${selectedIds.size})`}
                </button>
                <button
                  type="button"
                  onClick={() => runExport('zip', Array.from(selectedIds))}
                  disabled={selectedIds.size === 0 || exporting}
                  className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 flex-shrink-0"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', opacity: (selectedIds.size === 0 || exporting) ? 0.5 : 1 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#34d399' }}>folder_zip</span>
                  {exporting ? 'Erstelle …' : `ZIP erstellen (${selectedIds.size})`}
                </button>
              </div>
              <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                Hake rechts die Punkte an (Kästchen neben dem Löschen-Symbol). Das PDF listet die ausgewählten Punkte, das ZIP enthält deren Dateien.
              </span>
            </div>
          )}

          {/* Kategorie-Liste mit Drag-Reorder */}
          {orderedCats.map((cat, idx) => (
            <SteuerCategoryBlock
              key={cat.id}
              jahr={jahr}
              category={cat}
              index={idx}
              dragHandleProps={{
                onPointerDown: (e) => catDown(idx, e),
                onPointerEnter: () => catEnter(idx),
                onPointerUp: catUp,
              }}
              onRequestDelete={(c) => setPendingDelete(c)}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          ))}

          {/* Überbegriff hinzufügen */}
          <button
            type="button"
            onClick={() => createCat.mutate(undefined)}
            className="self-start px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>Überbegriff hinzufügen
          </button>
        </div>
      )}

      {/* Lösch-Bestätigungsdialog */}
      {pendingDelete && (
        <DeleteCategoryDialog
          name={pendingDelete.name}
          onConfirm={() => deleteCat.mutate(pendingDelete.id)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </PageWrapper>
  );
}

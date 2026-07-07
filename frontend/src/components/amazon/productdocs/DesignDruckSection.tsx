import { SectionHeader } from '../SectionHeader';
import { useSectionExpanded } from '../../../hooks/amazon/useSectionExpanded';
import { ProductDocsSection } from './ProductDocsSection';
import {
  useProductDocTopics, useCreateProductDocTopic, useRenameProductDocTopic,
  useReorderProductDocTopics, useDeleteProductDocTopic,
} from '../../../hooks/amazon/useProductDocTopics';
import type { ProductDocTopic } from '../../../api/amazon.api';

// Oberpunkt-Akzent — globale Primärfarbe (Blau/Grün-Palette, kein Lila mehr).
const OBERPUNKT_ACCENT = 'var(--color-primary)';
// Einheitlicher sekundärer Akzent für die Unterpunkte.
const TOPIC_ACCENT = '#22d3ee';

interface Props {
  productId: number;
}

export function DesignDruckSection({ productId }: Props) {
  const { expanded, toggle } = useSectionExpanded(productId, 'docs.design_druck', false);
  const { data: topics, isLoading, isError, refetch } = useProductDocTopics(productId);
  const create = useCreateProductDocTopic(productId);
  const rename = useRenameProductDocTopic(productId);
  const reorder = useReorderProductDocTopics(productId);
  const del = useDeleteProductDocTopic(productId);

  const list = topics ?? [];

  function addTopic() {
    const name = window.prompt('Name des neuen Unterpunkts:', '');
    if (name === null) return; // Abbrechen
    const trimmed = name.trim();
    create.mutate(trimmed.length > 0 ? trimmed : undefined);
  }

  function renameTopic(t: ProductDocTopic) {
    const name = window.prompt('Unterpunkt umbenennen:', t.name);
    if (name === null) return;
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === t.name) return;
    rename.mutate({ topicId: t.id, name: trimmed });
  }

  function deleteTopic(t: ProductDocTopic) {
    if (window.confirm(`Unterpunkt „${t.name}" inklusive aller Dateien und Notizen wirklich löschen?`)) {
      del.mutate(t.id);
    }
  }

  // Hoch/runter-Sortierung: aktuelle Reihenfolge kopieren, Nachbarn tauschen, neue ID-Reihenfolge senden.
  function moveTopic(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const ids = list.map(t => t.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate(ids);
  }

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader
        icon="palette"
        title="Design & Druck"
        accent={OBERPUNKT_ACCENT}
        expanded={expanded}
        onToggleExpand={toggle}
      />
      {expanded && (
        <div className="p-4 pt-0 flex flex-col gap-4">
          {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
          {isError && (
            <button type="button" onClick={() => refetch()} className="self-start px-3 py-1.5 rounded-md text-sm"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
          )}

          {topics && list.length === 0 && (
            // Freundlicher Leerzustand.
            <div
              className="flex flex-col items-center gap-3 py-8 px-4 rounded-lg text-center"
              style={{ border: '1px dashed rgba(255,255,255,0.12)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '40px', color: OBERPUNKT_ACCENT }}>palette</span>
              <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
                Noch keine Unterpunkte. Lege deinen ersten Unterpunkt an — z.&nbsp;B. „Verpackungsdesign",
                „Aufbauanleitung" oder was immer du für dieses Produkt brauchst.
              </p>
              <button
                type="button"
                onClick={addTopic}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium"
                style={{ background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', color: 'var(--color-on-primary)', borderRadius: 9999 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
                Unterpunkt hinzufügen
              </button>
            </div>
          )}

          {list.map((t, i) => (
            <div key={t.id} className="flex flex-col">
              {/* Kopf-Aktionen des Unterpunkts (Sortieren/Umbenennen/Löschen) */}
              <div className="flex items-center justify-end gap-1 mb-1">
                <button
                  type="button"
                  onClick={() => moveTopic(i, -1)}
                  disabled={i === 0}
                  aria-label="Nach oben"
                  title="Nach oben"
                  className="flex items-center justify-center rounded-md disabled:opacity-30"
                  style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)', width: '28px', height: '28px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>keyboard_arrow_up</span>
                </button>
                <button
                  type="button"
                  onClick={() => moveTopic(i, 1)}
                  disabled={i === list.length - 1}
                  aria-label="Nach unten"
                  title="Nach unten"
                  className="flex items-center justify-center rounded-md disabled:opacity-30"
                  style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)', width: '28px', height: '28px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>keyboard_arrow_down</span>
                </button>
                <button
                  type="button"
                  onClick={() => renameTopic(t)}
                  aria-label="Umbenennen"
                  title="Umbenennen"
                  className="flex items-center justify-center rounded-md"
                  style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)', width: '28px', height: '28px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteTopic(t)}
                  aria-label="Löschen"
                  title="Unterpunkt löschen"
                  className="flex items-center justify-center rounded-md"
                  style={{ background: 'var(--color-surface-container)', color: '#ff6b6b', width: '28px', height: '28px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                </button>
              </div>
              <ProductDocsSection
                productId={productId}
                topicId={t.id}
                title={t.name}
                accent={TOPIC_ACCENT}
                icon="folder"
              />
            </div>
          ))}

          {/* „+ Unterpunkt hinzufügen" — unter der Liste (nicht im Leerzustand doppelt). */}
          {list.length > 0 && (
            <button
              type="button"
              onClick={addTopic}
              className="self-start inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium"
              style={{ background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))', color: 'var(--color-on-primary)', borderRadius: 9999 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
              Unterpunkt hinzufügen
            </button>
          )}
        </div>
      )}
    </section>
  );
}

import { useState } from 'react';
import { type ChecklistItem } from '../../../api/amazon.api';
import {
  useChecklistProduct,
  useCreateProductSection,
  useUpdateProductSection,
  useDeleteProductSection,
  useCreateProductItem,
  useUpdateProductItem,
  useDeleteProductItem,
} from '../../../hooks/amazon/useChecklistProduct';
import { SectionHeader } from '../SectionHeader';
import { ChecklistSectionBlock } from './ChecklistSectionBlock';
import { AddSectionForm } from './AddSectionForm';
import { EditItemDialog } from './EditItemDialog';

const ACCENT = '#a3e635';
const STORAGE_KEY = (productId: number) => `amazon.checklist.expanded.${productId}`;

interface Props {
  productId: number;
}

export function ChecklistSection({ productId }: Props) {
  const { data, isLoading, isError, refetch } = useChecklistProduct(productId);
  const createSection = useCreateProductSection(productId);
  const updateSection = useUpdateProductSection(productId);
  const deleteSection = useDeleteProductSection(productId);
  const createItem = useCreateProductItem(productId);
  const updateItem = useUpdateProductItem(productId);
  const deleteItem = useDeleteProductItem(productId);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);

  const [expanded, setExpanded] = useState<boolean>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY(productId)) : null;
    return v === null ? true : v === '1';
  });

  function toggle() {
    setExpanded(prev => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY(productId), next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  const totalItems = data?.sections.reduce((s, sec) => s + sec.items.length, 0) ?? 0;
  const doneItems = data?.sections.reduce(
    (s, sec) => s + sec.items.filter(i => i.is_done === 1).length, 0,
  ) ?? 0;

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader
        icon="checklist"
        title="Checkliste"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={toggle}
        rightSlot={
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: `${ACCENT}33`, color: ACCENT }}
          >
            {doneItems} / {totalItems}
          </span>
        }
      />
      {expanded && (
        <div className="px-2 pb-4">
          {isLoading && <p className="px-5 py-3" style={{ color: 'var(--color-on-surface-variant)' }}>Lade Checkliste …</p>}
          {isError && (
            <div className="px-5 py-3">
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
            <>
              {data.sections.map(section => (
                <ChecklistSectionBlock
                  key={section.id}
                  section={section}
                  onUpdateSection={(patch) => updateSection.mutate({ sectionId: section.id, patch })}
                  onDeleteSection={() => {
                    if (confirm(`Section „${section.title}" inklusive aller Punkte löschen?`)) {
                      deleteSection.mutate(section.id);
                    }
                  }}
                  onCreateItem={(input) => createItem.mutate({ sectionId: section.id, input })}
                  onUpdateItem={(itemId, patch) => updateItem.mutate({ itemId, patch })}
                  onRequestEditItem={setEditingItem}
                  onRequestDeleteItem={(item) => {
                    if (confirm(`Punkt „${item.description}" löschen?`)) {
                      deleteItem.mutate(item.id);
                    }
                  }}
                />
              ))}
              <div className="px-3">
                <AddSectionForm onAdd={(title) => createSection.mutateAsync(title)} />
              </div>
            </>
          )}
        </div>
      )}

      <EditItemDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={async (patch) => {
          if (!editingItem) return;
          await updateItem.mutateAsync({ itemId: editingItem.id, patch });
        }}
      />
    </section>
  );
}

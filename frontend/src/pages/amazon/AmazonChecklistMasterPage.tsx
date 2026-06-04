import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { type ChecklistItem } from '../../api/amazon.api';
import {
  useChecklistMaster,
  useCreateMasterSection,
  useUpdateMasterSection,
  useDeleteMasterSection,
  useCreateMasterItem,
  useUpdateMasterItem,
  useDeleteMasterItem,
} from '../../hooks/amazon/useChecklistMaster';
import { ChecklistSectionBlock } from '../../components/amazon/checklist/ChecklistSectionBlock';
import { AddSectionForm } from '../../components/amazon/checklist/AddSectionForm';
import { EditItemDialog } from '../../components/amazon/checklist/EditItemDialog';

export function AmazonChecklistMasterPage() {
  const { data, isLoading, isError, refetch } = useChecklistMaster();
  const createSection = useCreateMasterSection();
  const updateSection = useUpdateMasterSection();
  const deleteSection = useDeleteMasterSection();
  const createItem = useCreateMasterItem();
  const updateItem = useUpdateMasterItem();
  const deleteItem = useDeleteMasterItem();
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);

  return (
    <PageWrapper>
      <header className="flex items-center gap-3 mb-2">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--color-surface-container)' }}
        >
          <span className="material-symbols-outlined" style={{ color: '#bef264' }}>checklist</span>
        </div>
        <div>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            Checkliste — Master
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>
            Diese Vorlage wird beim Anlegen eines neuen Produkts ins Produkt kopiert. Spätere Änderungen wirken nicht auf bereits angelegte Produkte zurück.
          </p>
        </div>
      </header>

      <div className="mt-6">
        {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Checkliste …</p>}
        {isError && (
          <div className="rounded-lg p-4" style={{ background: 'var(--color-surface-container-low)' }}>
            <p style={{ color: 'var(--color-on-surface)' }}>Master-Checkliste konnte nicht geladen werden.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 px-3 py-1.5 rounded-md text-sm"
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
                onUpdateSection={(patch) => updateSection.mutate({ id: section.id, patch })}
                onDeleteSection={() => {
                  if (confirm(`Section „${section.title}" inklusive aller Punkte löschen?`)) {
                    deleteSection.mutate(section.id);
                  }
                }}
                onCreateItem={(input) => createItem.mutate({ sectionId: section.id, input })}
                onUpdateItem={(itemId, patch) => updateItem.mutate({ id: itemId, patch })}
                onRequestEditItem={setEditingItem}
                onRequestDeleteItem={(item) => {
                  if (confirm(`Punkt „${item.description}" löschen?`)) {
                    deleteItem.mutate(item.id);
                  }
                }}
              />
            ))}
            <AddSectionForm onAdd={(title) => createSection.mutateAsync(title)} />
          </>
        )}
      </div>

      <EditItemDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={async (patch) => {
          if (!editingItem) return;
          await updateItem.mutateAsync({ id: editingItem.id, patch });
        }}
      />
    </PageWrapper>
  );
}

import { useEffect, useState } from 'react';
import {
  type ChecklistItem, type ChecklistItemCreate, type ChecklistItemPatch,
  type ChecklistSection, type ChecklistSectionPatch,
} from '../../../api/amazon.api';
import { ChecklistItemRow } from './ChecklistItemRow';
import { AddItemForm } from './AddItemForm';

interface Props {
  section: ChecklistSection;
  onUpdateSection: (patch: ChecklistSectionPatch) => void;
  onDeleteSection: () => void;
  onCreateItem: (input: ChecklistItemCreate) => void;
  onUpdateItem: (itemId: number, patch: ChecklistItemPatch) => void;
  onRequestEditItem: (item: ChecklistItem) => void;
  onRequestDeleteItem: (item: ChecklistItem) => void;
}

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--color-on-surface-variant)',
  padding: '8px',
  whiteSpace: 'nowrap',
};

export function ChecklistSectionBlock({
  section, onUpdateSection, onDeleteSection,
  onCreateItem, onUpdateItem, onRequestEditItem, onRequestDeleteItem,
}: Props) {
  const [title, setTitle] = useState(section.title);
  useEffect(() => { setTitle(section.title); }, [section.title]);

  function saveTitle() {
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed === section.title) {
      setTitle(section.title);
      return;
    }
    onUpdateSection({ title: trimmed });
  }

  const doneCount = section.items.filter(i => i.is_done === 1).length;

  return (
    <section
      className="rounded-xl overflow-hidden mb-4"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-2 px-5 py-3"
        style={{ background: 'rgba(101,163,13,0.18)' }}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-transparent border-0 outline-none font-semibold text-base"
          style={{ color: '#bef264' }}
        />
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#bef264' }}
        >
          {doneCount} / {section.items.length}
        </span>
        <button
          type="button"
          onClick={onDeleteSection}
          aria-label="Section löschen"
          className="p-1 rounded hover:bg-white/10"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#fca5a5' }}>delete</span>
        </button>
      </header>

      {/* Tabelle */}
      <div className="px-3 pb-3">
        {section.items.length === 0 ? (
          <p
            className="text-sm text-center py-4"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            Noch keine Punkte in dieser Section.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, textAlign: 'right', width: 36 }}>#</th>
                <th style={TH_STYLE}>Beschreibung</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Erledigt</th>
                <th style={TH_STYLE}>Bemerkung</th>
                <th style={TH_STYLE}>Link</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {section.items.map((item, idx) => (
                <ChecklistItemRow
                  key={item.id}
                  rowNumber={idx + 1}
                  item={item}
                  onUpdate={(patch) => onUpdateItem(item.id, patch)}
                  onRequestEdit={onRequestEditItem}
                  onRequestDelete={onRequestDeleteItem}
                />
              ))}
            </tbody>
          </table>
        )}
        <div className="px-2">
          <AddItemForm onAdd={(description) => onCreateItem({ description })} />
        </div>
      </div>
    </section>
  );
}

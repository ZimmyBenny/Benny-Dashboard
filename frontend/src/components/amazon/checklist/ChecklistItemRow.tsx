import { useEffect, useState } from 'react';
import { type ChecklistItem, type ChecklistItemPatch } from '../../../api/amazon.api';

interface Props {
  rowNumber: number;
  item: ChecklistItem;
  onUpdate: (patch: ChecklistItemPatch) => void;
  onRequestEdit: (item: ChecklistItem) => void;
  onRequestDelete: (item: ChecklistItem) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function ChecklistItemRow({ rowNumber, item, onUpdate, onRequestEdit, onRequestDelete }: Props) {
  const [description, setDescription] = useState(item.description);
  useEffect(() => { setDescription(item.description); }, [item.description]);

  const [editingRemark, setEditingRemark] = useState(false);
  const [remark, setRemark] = useState(item.remark ?? '');
  useEffect(() => { setRemark(item.remark ?? ''); }, [item.remark]);

  function saveDescription() {
    const trimmed = description.trim();
    if (trimmed.length === 0 || trimmed === item.description) {
      setDescription(item.description);
      return;
    }
    onUpdate({ description: trimmed });
  }

  function saveRemark() {
    setEditingRemark(false);
    const trimmed = remark.trim();
    const current = item.remark ?? '';
    if (trimmed === current) {
      setRemark(current);
      return;
    }
    onUpdate({ remark: trimmed.length === 0 ? null : trimmed });
  }

  function cancelRemark() {
    setRemark(item.remark ?? '');
    setEditingRemark(false);
  }

  function toggleDone() {
    onUpdate({ is_done: item.is_done === 1 ? 0 : 1 });
  }

  const linkText = item.link_label || item.link_url;

  return (
    <tr
      className="group"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        opacity: item.is_done === 1 ? 0.7 : 1,
      }}
    >
      <td className="p-2 text-right text-xs tabular-nums" style={{ color: 'var(--color-on-surface-variant)' }}>
        {rowNumber}
      </td>
      <td className="p-2">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          className="w-full px-2 py-1 rounded text-sm"
          style={{
            ...INPUT_STYLE,
            textDecoration: item.is_done === 1 ? 'line-through' : 'none',
          }}
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={item.is_done === 1}
          onChange={toggleDone}
          className="w-4 h-4"
          style={{ accentColor: 'var(--color-primary)' }}
          aria-label="Erledigt"
        />
      </td>
      <td className="p-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
        {editingRemark ? (
          <input
            type="text"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            onBlur={saveRemark}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.currentTarget.blur(); }
              else if (e.key === 'Escape') { cancelRemark(); }
            }}
            autoFocus
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            className="w-full px-2 py-1 rounded text-sm"
            style={INPUT_STYLE}
          />
        ) : (
          <div
            onDoubleClick={() => setEditingRemark(true)}
            className="px-2 py-1 rounded cursor-text min-h-[1.75rem] hover:bg-white/5 transition-colors"
            title="Doppelklick zum Bearbeiten"
          >
            {item.remark ?? ''}
          </div>
        )}
      </td>
      <td className="p-2 text-sm">
        {item.link_url && linkText ? (
          <a
            href={item.link_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
          >
            {linkText}
          </a>
        ) : null}
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => onRequestEdit(item)}
          aria-label="Bemerkung / Link bearbeiten"
          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/5"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-on-surface-variant)' }}>edit</span>
        </button>
        <button
          type="button"
          onClick={() => onRequestDelete(item)}
          aria-label="Punkt löschen"
          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/5"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#fca5a5' }}>delete</span>
        </button>
      </td>
    </tr>
  );
}

import { useEffect, useState } from 'react';
import { type ChecklistItem, type ChecklistItemPatch } from '../../../api/amazon.api';

interface Props {
  item: ChecklistItem | null;
  onClose: () => void;
  onSave: (patch: ChecklistItemPatch) => Promise<void> | void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function EditItemDialog({ item, onClose, onSave }: Props) {
  const [remark, setRemark] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRemark(item?.remark ?? '');
    setLinkUrl(item?.link_url ?? '');
    setLinkLabel(item?.link_label ?? '');
  }, [item]);

  if (!item) return null;

  function normalize(s: string): string | null {
    const t = s.trim();
    return t.length === 0 ? null : t;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        remark: normalize(remark),
        link_url: normalize(linkUrl),
        link_label: normalize(linkLabel),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-[92vw] rounded-xl p-5"
        style={{ background: 'var(--color-surface-container)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold mb-3" style={{ color: 'var(--color-on-surface)' }}>
          „{item.description}"
        </h2>

        <label className="block mb-3">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Bemerkung</span>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            maxLength={1000}
            rows={3}
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full px-2 py-1 rounded text-sm resize-y"
            style={INPUT_STYLE}
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Link-URL</span>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            maxLength={500}
            placeholder="https://…"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full px-2 py-1 rounded text-sm"
            style={INPUT_STYLE}
          />
        </label>

        <label className="block mb-4">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Link-Label</span>
          <input
            type="text"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            maxLength={100}
            placeholder="Anzeigetext (leer = URL wird gezeigt)"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full px-2 py-1 rounded text-sm"
            style={INPUT_STYLE}
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            {saving ? 'Speichern …' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

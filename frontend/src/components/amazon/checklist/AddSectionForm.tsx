import { useState } from 'react';

interface Props {
  onAdd: (title: string) => void | Promise<void>;
}

export function AddSectionForm({ onAdd }: Props) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = title.trim();

  async function submit() {
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    try {
      await onAdd(trimmed);
      setTitle('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Neue Section …"
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
        className="flex-1 px-3 py-2 rounded-md text-sm"
        style={{
          background: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={trimmed.length === 0 || busy}
        className="px-3 py-2 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
        style={{
          background: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span className="material-symbols-outlined text-base">add</span>
        Section
      </button>
    </div>
  );
}

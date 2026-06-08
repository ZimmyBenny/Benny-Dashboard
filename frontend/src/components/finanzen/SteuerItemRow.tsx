import { useEffect, useRef, useState } from 'react';
import { type SteuerItem } from '../../api/steuer.api';
import {
  useUpdateSteuerItem,
  useDeleteSteuerItem,
  useUploadSteuerFile,
  useDeleteSteuerFile,
} from '../../hooks/finanzen/useSteuer';
import { SteuerFileRow } from './SteuerFileRow';

const MAX_BYTES = 20 * 1024 * 1024;

interface Props {
  jahr: number;
  item: SteuerItem;
  selected: boolean;
  onToggleSelect: () => void;
}

export function SteuerItemRow({ jahr, item, selected, onToggleSelect }: Props) {
  const update = useUpdateSteuerItem(jahr);
  const delItem = useDeleteSteuerItem(jahr);
  const upload = useUploadSteuerFile(jahr);
  const delFile = useDeleteSteuerFile(jahr);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => { setTitle(item.title); }, [item.title]);
  useEffect(() => { setNote(item.note ?? ''); }, [item.note]);

  function handleFilePick(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setFileError('Datei ist größer als 20 MB.'); return; }
    setFileError(null);
    upload.mutate({ itemId: item.id, file: f });
  }

  const inputStyle = {
    background: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface)',
    border: '1px solid rgba(255,255,255,0.08)',
  };

  return (
    <div
      className="flex flex-col gap-1.5 py-2 px-2 rounded-md"
      style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Hauptzeile: Checkbox + Titel + Löschen */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={item.is_done === 1}
          onChange={() => update.mutate({ id: item.id, patch: { is_done: item.is_done ? 0 : 1 } })}
          className="flex-shrink-0 cursor-pointer"
          aria-label="Erledigt"
          style={{ accentColor: 'var(--color-primary)', width: 16, height: 16 }}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title !== item.title) update.mutate({ id: item.id, patch: { title } }); }}
          placeholder="Punkt …"
          className="flex-1 px-2 py-1 rounded-md text-sm"
          style={{
            ...inputStyle,
            textDecoration: item.is_done ? 'line-through' : 'none',
            opacity: item.is_done ? 0.5 : 1,
          }}
        />
        {confirmDelete ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs" style={{ color: '#fca5a5' }}>Wirklich löschen?</span>
            <button
              type="button"
              onClick={() => { delItem.mutate(item.id); setConfirmDelete(false); }}
              className="px-1.5 py-0.5 rounded-md text-xs"
              style={{ background: '#7f1d1d', color: '#fecaca' }}
            >
              Ja
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-1.5 py-0.5 rounded-md text-xs"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
            >
              Nein
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="p-1 rounded-md flex-shrink-0"
            style={{ color: '#fca5a5' }}
            aria-label="Punkt löschen"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
          </button>
        )}
        <label className="flex items-center gap-1 flex-shrink-0 cursor-pointer" title="Für PDF-Export auswählen">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: selected ? '#34d399' : 'var(--color-on-surface-variant)' }}>picture_as_pdf</span>
        </label>
      </div>

      {/* Notiz */}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => { if (note !== (item.note ?? '')) update.mutate({ id: item.id, patch: { note: note || null } }); }}
        placeholder="Notiz …"
        className="w-full px-2 py-1 rounded-md text-xs"
        style={inputStyle}
      />

      {/* Dokumente */}
      <div className="flex flex-col gap-1">
        {item.files.length > 0 && (
          <div className="flex flex-col gap-1">
            {item.files.map(f => (
              <SteuerFileRow
                key={f.id}
                itemId={item.id}
                file={f}
                onDelete={() => delFile.mutate({ itemId: item.id, fId: f.id })}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="self-start px-2 py-1 rounded-md text-xs flex items-center gap-1"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>upload_file</span>Datei hochladen
          </button>
          {fileError && <span className="text-xs" style={{ color: '#fca5a5' }}>{fileError}</span>}
        </div>
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(e) => { handleFilePick(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
    </div>
  );
}

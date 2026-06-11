import { useEffect, useRef, useState } from 'react';
import { type SteuerItem, type SteuerFile, getSteuerFileObjectUrl } from '../../api/steuer.api';
import {
  useUpdateSteuerItem,
  useDeleteSteuerItem,
  useUploadSteuerFile,
  useDeleteSteuerFile,
} from '../../hooks/finanzen/useSteuer';
import { FilePreviewModal, useFilePreview } from '../amazon/FilePreviewModal';

const MAX_BYTES = 20 * 1024 * 1024;

interface Props {
  jahr: number;
  item: SteuerItem;
  selected: boolean;
  onToggleSelect: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}

export function SteuerItemRow({ jahr, item, selected, onToggleSelect, dragHandleProps }: Props) {
  const update = useUpdateSteuerItem(jahr);
  const delItem = useDeleteSteuerItem(jahr);
  const upload = useUploadSteuerFile(jahr);
  const delFile = useDeleteSteuerFile(jahr);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const fp = useFilePreview();

  const [title, setTitle] = useState(item.title);
  const [note, setNote] = useState(item.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => { setTitle(item.title); }, [item.title]);
  useEffect(() => { setNote(item.note ?? ''); }, [item.note]);

  function handleFiles(files: FileList | null | undefined) {
    const arr = Array.from(files ?? []);
    if (arr.length === 0) return;
    let anyTooBig = false;
    for (const f of arr) {
      if (f.size > MAX_BYTES) { anyTooBig = true; continue; }
      upload.mutate({ itemId: item.id, file: f });
    }
    setFileError(anyTooBig ? 'Mindestens eine Datei ist größer als 20 MB und wurde übersprungen.' : null);
  }
  async function viewFile(f: SteuerFile) {
    const url = await getSteuerFileObjectUrl(item.id, f.id);
    fp.open(url, f.mime, f.original_name || 'Datei');
  }
  async function downloadFile(f: SteuerFile) {
    const url = await getSteuerFileObjectUrl(item.id, f.id);
    const a = document.createElement('a'); a.href = url; a.download = f.original_name || 'datei'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  const inputStyle = {
    background: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface)',
    border: '1px solid rgba(255,255,255,0.08)',
  };
  const done = item.is_done === 1;

  return (
    <tr
      onDragOver={(e) => { e.preventDefault(); if (!dragActive) setDragActive(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false); }}
      onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files); }}
      style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: dragActive ? 'rgba(96,165,250,0.12)' : 'transparent' }}
    >
      {/* POSITION */}
      <td className="py-2 pr-3 align-top">
        <div className="flex items-center gap-2">
          <div
            {...dragHandleProps}
            className="cursor-grab select-none flex-shrink-0 flex items-center"
            title="Zum Sortieren ziehen"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>drag_indicator</span>
          </div>
          <input
            type="checkbox"
            checked={done}
            onChange={() => update.mutate({ id: item.id, patch: { is_done: done ? 0 : 1 } })}
            className="flex-shrink-0 cursor-pointer"
            aria-label="Erledigt"
            style={{ accentColor: 'var(--color-primary)', width: 16, height: 16 }}
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { if (title !== item.title) update.mutate({ id: item.id, patch: { title } }); }}
            placeholder="Punkt …"
            className="flex-1 min-w-0 px-2 py-1 rounded-md text-sm"
            style={{ ...inputStyle, textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.55 : 1 }}
          />
        </div>
      </td>
      {/* NOTIZ */}
      <td className="py-2 px-3 align-top" style={{ minWidth: 140 }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if (note !== (item.note ?? '')) update.mutate({ id: item.id, patch: { note: note || null } }); }}
          placeholder="Notiz …"
          className="w-full px-2 py-1 rounded-md text-xs"
          style={inputStyle}
        />
      </td>
      {/* DATEI(EN) */}
      <td className="py-2 px-3 align-top" style={{ minWidth: 200 }}>
        <div className="flex flex-col gap-1">
          {item.files.map(f => (
            <div key={f.id} className="flex items-center gap-1 px-2 py-1 rounded-md" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 14, color: 'var(--color-on-surface-variant)' }}>description</span>
              <button type="button" onClick={() => viewFile(f)} className="text-xs truncate flex-1 min-w-0 text-left" style={{ color: 'var(--color-on-surface)' }} title={f.original_name ?? undefined}>{f.original_name || 'Datei'}</button>
              <button type="button" onClick={() => viewFile(f)} className="p-0.5 flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }} aria-label="Ansehen" title="Ansehen"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span></button>
              <button type="button" onClick={() => downloadFile(f)} className="p-0.5 flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }} aria-label="Herunterladen" title="Herunterladen"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span></button>
              <button type="button" onClick={() => delFile.mutate({ itemId: item.id, fId: f.id })} className="p-0.5 flex-shrink-0" style={{ color: '#fca5a5' }} aria-label="Datei löschen" title="Datei löschen"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span></button>
            </div>
          ))}
          {item.files.length === 0 && <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>—</span>}
          {fileError && <span className="text-xs" style={{ color: '#fca5a5' }}>{fileError}</span>}
        </div>
      </td>
      {/* AKTIONEN */}
      <td className="py-2 pl-3 align-top" style={{ whiteSpace: 'nowrap' }}>
        <div className="flex items-center gap-1 justify-end">
          <button type="button" onClick={() => fileInput.current?.click()} className="p-1 rounded-md flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }} title="Datei(en) hochladen" aria-label="Hochladen">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>
          </button>
          <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
          <label className="flex items-center cursor-pointer p-1 flex-shrink-0" title="Für PDF-Export auswählen">
            <input type="checkbox" checked={selected} onChange={onToggleSelect} />
            <span className="material-symbols-outlined ml-0.5" style={{ fontSize: 16, color: selected ? '#34d399' : 'var(--color-on-surface-variant)' }}>picture_as_pdf</span>
          </label>
          {confirmDelete ? (
            <span className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={() => { delItem.mutate(item.id); setConfirmDelete(false); }} className="px-1.5 py-0.5 rounded text-xs" style={{ background: '#7f1d1d', color: '#fecaca' }}>Ja</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Nein</button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="p-1 rounded-md flex-shrink-0" style={{ color: '#fca5a5' }} aria-label="Punkt löschen" title="Punkt löschen">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
            </button>
          )}
        </div>
        <FilePreviewModal preview={fp.preview} onClose={fp.close} />
      </td>
    </tr>
  );
}

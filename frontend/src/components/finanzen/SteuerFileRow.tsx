import { useEffect, useState } from 'react';
import { type SteuerFile, getSteuerFileObjectUrl } from '../../api/steuer.api';
import { FilePreviewModal, useFilePreview } from '../amazon/FilePreviewModal';

interface Props {
  itemId: number;
  file: SteuerFile;
  onDelete: () => void;
}

export function SteuerFileRow({ itemId, file, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fp = useFilePreview();
  const isImage = (file.mime ?? '').startsWith('image/');
  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage) return;
    let revoked = false; let url: string | null = null;
    getSteuerFileObjectUrl(itemId, file.id).then(u => {
      if (revoked) { URL.revokeObjectURL(u); return; }
      url = u; setThumb(u);
    }).catch(() => setThumb(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [isImage, itemId, file.id]);

  async function view() {
    const url = await getSteuerFileObjectUrl(itemId, file.id);
    fp.open(url, file.mime, file.original_name || 'Datei');
  }

  async function download() {
    const url = await getSteuerFileObjectUrl(itemId, file.id);
    const a = document.createElement('a'); a.href = url; a.download = file.original_name || 'datei'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded-md"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {isImage
        ? <button
            type="button"
            onClick={view}
            className="flex-shrink-0 rounded overflow-hidden flex items-center justify-center"
            style={{ width: 28, height: 28, border: '1px solid rgba(255,255,255,0.08)', background: 'var(--color-surface-container)' }}
            title="Vorschau"
          >
            {thumb
              ? <img src={thumb} alt="" className="w-full h-full object-cover" />
              : <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--color-on-surface-variant)' }}>image</span>}
          </button>
        : <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 14, color: 'var(--color-on-surface-variant)' }}>description</span>}

      <span
        className="text-xs truncate flex-1 min-w-0"
        style={{ color: 'var(--color-on-surface)' }}
        title={file.original_name ?? undefined}
      >
        {file.original_name || 'Datei'}
      </span>

      {!isImage && (
        <button
          type="button"
          onClick={view}
          className="p-1 rounded-md flex-shrink-0"
          style={{ color: 'var(--color-on-surface-variant)' }}
          aria-label="Datei ansehen"
          title="Ansehen"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span>
        </button>
      )}

      <button
        type="button"
        onClick={download}
        className="p-1 rounded-md flex-shrink-0"
        style={{ color: 'var(--color-on-surface-variant)' }}
        aria-label="Datei herunterladen"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
      </button>

      {confirmDelete ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs" style={{ color: '#fca5a5' }}>Wirklich löschen?</span>
          <button
            type="button"
            onClick={() => { onDelete(); setConfirmDelete(false); }}
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
          aria-label="Datei löschen"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
        </button>
      )}

      <FilePreviewModal preview={fp.preview} onClose={fp.close} />
    </div>
  );
}

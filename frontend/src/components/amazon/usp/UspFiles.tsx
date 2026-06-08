import { useEffect, useRef, useState } from 'react';
import { getUspFileObjectUrl, type UspFile } from '../../../api/amazon.api';
import { useUploadUspFile, useDeleteUspFile } from '../../../hooks/amazon/useUsp';
import { DeleteUspFileDialog } from './DeleteUspFileDialog';

const MAX_BYTES = 20 * 1024 * 1024;

function FileCard({ productId, file, onRequestDelete }: { productId: number; file: UspFile; onRequestDelete: () => void }) {
  const isImage = file.mime.startsWith('image/');
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    let revoked = false; let url: string | null = null;
    getUspFileObjectUrl(productId, file.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [isImage, productId, file.id]);
  async function download() {
    const url = await getUspFileObjectUrl(productId, file.id);
    const a = document.createElement('a'); a.href = url; a.download = file.original_name || 'datei'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  return (
    <div className="rounded-lg p-2 flex flex-col gap-1.5" style={{ width: 140, background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="rounded-md flex items-center justify-center overflow-hidden" style={{ height: 90, background: 'var(--color-surface-container-low)' }}>
        {isImage && src
          ? <img src={src} alt="" className="w-full h-full object-cover" />
          : <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--color-on-surface-variant)' }}>description</span>}
      </div>
      <span className="text-xs truncate" style={{ color: 'var(--color-on-surface)' }} title={file.original_name}>{file.original_name || 'Datei'}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={download} className="flex-1 px-2 py-1 rounded-md text-xs flex items-center justify-center gap-1"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>Laden
        </button>
        <button type="button" onClick={onRequestDelete} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Datei löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
    </div>
  );
}

export function UspFiles({ productId, files }: { productId: number; files: UspFile[] }) {
  const upload = useUploadUspFile(productId);
  const del = useDeleteUspFile(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UspFile | null>(null);
  function pick(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setError('Datei ist größer als 20 MB.'); return; }
    setError(null); upload.mutate(f);
  }
  return (
    <div className="flex flex-col gap-2"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Dateien & Bild-Ideen</span>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map(f => <FileCard key={f.id} productId={productId} file={f} onRequestDelete={() => setPendingDelete(f)} />)}
        </div>
      )}
      <button type="button" onClick={() => fileInput.current?.click()} className="self-start px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>Datei hochladen
      </button>
      <input ref={fileInput} type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p className="text-xs" style={{ color: '#fca5a5' }}>{error}</p>}
      {pendingDelete && (
        <DeleteUspFileDialog name={pendingDelete.original_name} onConfirm={() => del.mutate(pendingDelete.id)} onClose={() => setPendingDelete(null)} />
      )}
    </div>
  );
}

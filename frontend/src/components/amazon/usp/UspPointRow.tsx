import { useEffect, useRef, useState } from 'react';
import { type UspPoint } from '../../../api/amazon.api';
import { useUpdateUspPoint, useUploadUspPointImage } from '../../../hooks/amazon/useUsp';
import { UspPointImages } from './UspPointImages';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
  productId: number; index: number; point: UspPoint;
  onRequestDelete: (p: UspPoint) => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}
export function UspPointRow({ productId, index, point, onRequestDelete, dragHandleProps }: Props) {
  const update = useUpdateUspPoint(productId);
  const uploadImg = useUploadUspPointImage(productId);
  const [title, setTitle] = useState(point.title);
  const [body, setBody] = useState(point.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setTitle(point.title); }, [point.title]);
  useEffect(() => { setBody(point.body ?? ''); }, [point.body]);
  function pick(file: File | undefined | null) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) { setError('Nur JPG, PNG oder WEBP.'); return; }
    if (file.size > MAX_BYTES) { setError('Bild ist größer als 5 MB.'); return; }
    setError(null); uploadImg.mutate({ pointId: point.id, file });
  }
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
      <div className="flex items-center gap-2 mb-2">
        <div {...dragHandleProps} className="flex items-center justify-center rounded-md cursor-grab select-none"
          style={{ width: 26, height: 26, background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }} title="Zum Sortieren ziehen">
          <span style={{ fontSize: 12, fontWeight: 700 }}>{index + 1}</span>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title !== point.title) update.mutate({ pointId: point.id, patch: { title } }); }}
          placeholder="Titel (z. B. Design & Farbe)" className="flex-1 px-2 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
        <button type="button" onClick={() => onRequestDelete(point)} className="p-1.5 rounded-md" style={{ color: '#fca5a5' }} aria-label="Punkt löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)}
        onBlur={() => { if (body !== (point.body ?? '')) update.mutate({ pointId: point.id, patch: { body } }); }}
        placeholder="Beschreibung / Anforderungen …" rows={3} className="w-full px-2 py-1.5 rounded-md text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', resize: 'vertical' }} />
      <UspPointImages productId={productId} pointId={point.id} images={point.images} />
      <div className="mt-2">
        <button type="button" onClick={() => fileInput.current?.click()} className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_photo_alternate</span>Bild hinzufügen
        </button>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {error && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{error}</p>}
      </div>
    </div>
  );
}

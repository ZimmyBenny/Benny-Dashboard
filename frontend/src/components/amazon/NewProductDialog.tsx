import { useEffect, useRef, useState } from 'react';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import { useCreateAmazonProduct, useUploadAmazonProductImage } from '../../hooks/amazon/useAmazonProducts';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Nur JPG, PNG oder WEBP.';
  if (file.size > MAX_BYTES) return 'Bild ist größer als 5 MB.';
  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewProductDialog({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const create = useCreateAmazonProduct();
  const upload = useUploadAmazonProductImage();
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();

  useEffect(() => {
    if (!open) {
      setName(''); setFile(null); setError(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Paste-Support
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) { handlePickFile(f); break; }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [open]);

  function handlePickFile(f: File) {
    const msg = validateFile(f);
    if (msg) { setError(msg); return; }
    setError(null);
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 200) {
      setError('Name muss 1–200 Zeichen lang sein.');
      return;
    }
    setError(null);
    try {
      const product = await create.mutateAsync(trimmed);
      if (file) {
        try { await upload.mutateAsync({ id: product.id, file }); }
        catch { setError('Produkt angelegt, aber Bild-Upload fehlgeschlagen.'); return; }
      }
      onClose();
    } catch {
      setError('Anlegen fehlgeschlagen.');
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        data-draggable-modal
        className="w-[440px] max-w-[90vw] rounded-xl"
        style={{ background: 'var(--color-surface-container)', ...modalStyle }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ ...headerStyle, borderColor: 'rgba(255,255,255,0.08)' }}
          onMouseDown={onMouseDown}
        >
          <h2 className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>Neues Produkt</h2>
          <button type="button" onClick={onClose} aria-label="Schließen">
            <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)' }}>close</span>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <label className="block">
            <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Name</span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              className="mt-1 w-full px-3 py-2 rounded-md"
              style={{
                background: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </label>

          <div>
            <p className="text-sm mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>Produktbild (optional)</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handlePickFile(f);
              }}
              className="w-full aspect-[16/9] rounded-md flex items-center justify-center text-sm overflow-hidden"
              style={{
                background: 'var(--color-surface-container-low)',
                border: '1px dashed rgba(255,255,255,0.16)',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              {previewUrl
                ? <img src={previewUrl} alt="Vorschau" className="w-full h-full object-cover" />
                : <span>Klicken, Drag&Drop oder Cmd+V einfügen</span>}
            </button>
            <input
              ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickFile(f); }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={name.trim().length < 1 || create.isPending || upload.isPending}
              className="px-4 py-2 rounded-md text-sm disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
            >
              {create.isPending || upload.isPending ? 'Speichern…' : 'Anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

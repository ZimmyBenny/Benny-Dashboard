import { useCallback, useEffect, useRef, useState } from 'react';
import { SectionHeader } from '../SectionHeader';
import { useSectionExpanded } from '../../../hooks/amazon/useSectionExpanded';
import {
  useProductDocs, useUploadProductDoc, useDeleteProductDoc, useUpdateProductDocNotes,
} from '../../../hooks/amazon/useProductDocs';
import { getProductDocObjectUrl, type ProductDocArea, type ProductDocFile } from '../../../api/amazon.api';

interface Props {
  productId: number;
  area: ProductDocArea;
  title: string;
  accent: string;
  icon: string;
}

const AUTOSAVE_DELAY_MS = 600;
const MAX_NOTES = 20000;

function isImage(mime: string | null): boolean {
  return !!mime && mime.startsWith('image/');
}

// Datei-Icon je MIME-Typ (material-symbols).
function fileIcon(mime: string | null): string {
  if (mime === 'application/pdf') return 'picture_as_pdf';
  if (mime && mime.startsWith('video/')) return 'movie';
  if (mime && mime.startsWith('audio/')) return 'audiotrack';
  if (mime && (mime.includes('zip') || mime.includes('compressed'))) return 'folder_zip';
  return 'description';
}

export function ProductDocsSection({ productId, area, title, accent, icon }: Props) {
  const { expanded, toggle } = useSectionExpanded(productId, `docs.${area}`, false);
  const { data, isLoading, isError, refetch } = useProductDocs(productId, area);
  const upload = useUploadProductDoc(productId, area);
  const del = useDeleteProductDoc(productId, area);

  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const uploadFiles = useCallback((files: FileList | File[]) => {
    for (const f of Array.from(files)) upload.mutate(f);
  }, [upload]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
  }

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader
        icon={icon}
        title={title}
        accent={accent}
        expanded={expanded}
        onToggleExpand={toggle}
      />
      {expanded && (
        <div className="p-4 pt-0 flex flex-col gap-5">
          {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
          {isError && (
            <button type="button" onClick={() => refetch()} className="self-start px-3 py-1.5 rounded-md text-sm"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
          )}

          {data && (
            <>
              {/* Datei-/Bild-Bereich mit Drag&Drop */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className="rounded-lg p-3"
                style={{
                  border: dragOver ? `2px dashed ${accent}` : '1px dashed rgba(255,255,255,0.12)',
                  background: dragOver ? 'rgba(255,255,255,0.03)' : 'transparent',
                  transition: 'border-color 120ms, background 120ms',
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                    Bilder und Dateien (PDF, Dielines, Anleitungen …) — hier ablegen oder hochladen
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium"
                    style={{ background: accent, color: '#1a1a1a' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>upload</span>
                    Hochladen
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    hidden
                    onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
                  />
                </div>

                {data.files.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
                    Noch keine Dateien.
                  </p>
                ) : (
                  <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
                    {data.files.map((f) => (
                      <DocTile
                        key={f.id}
                        productId={productId}
                        area={area}
                        file={f}
                        accent={accent}
                        onDelete={() => del.mutate(f.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Notizfeld mit Auto-Save */}
              <DocNotes productId={productId} area={area} initialNotes={data.notes} />
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ── Einzelne Datei-/Bild-Kachel ──
function DocTile({
  productId, area, file, accent, onDelete,
}: {
  productId: number; area: ProductDocArea; file: ProductDocFile; accent: string; onDelete: () => void;
}) {
  const [thumb, setThumb] = useState<string | null>(null);
  const image = isImage(file.mime);

  useEffect(() => {
    if (!image) return;
    let url: string | null = null;
    let cancelled = false;
    getProductDocObjectUrl(productId, area, file.id)
      .then((u) => { if (cancelled) { URL.revokeObjectURL(u); return; } url = u; setThumb(u); })
      .catch(() => { /* Vorschau nicht verfügbar */ });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, area, file.id, image]);

  async function openFile() {
    try {
      const u = await getProductDocObjectUrl(productId, area, file.id);
      window.open(u, '_blank', 'noopener,noreferrer');
      // Objekt-URL erst nach kurzer Zeit freigeben, damit der neue Tab laden kann.
      window.setTimeout(() => URL.revokeObjectURL(u), 60_000);
    } catch { /* ignore */ }
  }

  return (
    <div
      className="group relative rounded-lg overflow-hidden flex flex-col cursor-pointer"
      style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.08)' }}
      onClick={openFile}
      title={file.original_name ?? 'Datei'}
    >
      <div className="flex items-center justify-center" style={{ height: '110px', background: 'var(--color-surface-container-low)' }}>
        {image && thumb ? (
          <img src={thumb} alt={file.original_name ?? ''} className="w-full h-full object-cover" />
        ) : (
          <span className="material-symbols-outlined" style={{ fontSize: '48px', color: accent }}>{fileIcon(file.mime)}</span>
        )}
      </div>
      <div className="px-2 py-1.5 text-xs truncate" style={{ color: 'var(--color-on-surface)' }}>
        {file.original_name ?? 'Datei'}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        aria-label="Löschen"
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md"
        style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', width: '26px', height: '26px' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
      </button>
    </div>
  );
}

// ── Notizfeld mit Debounce-/onBlur-Auto-Save (Muster wie ProductNotes) ──
function DocNotes({ productId, area, initialNotes }: { productId: number; area: ProductDocArea; initialNotes: string }) {
  const update = useUpdateProductDocNotes(productId, area);
  const [value, setValue] = useState<string>(initialNotes);
  const lastSavedRef = useRef<string>(initialNotes);
  const timerRef = useRef<number | null>(null);

  // Init nur bei productId/area-Wechsel — nicht bei jedem Refetch (sonst würde
  // der User-Input während des Tippens überschrieben).
  useEffect(() => {
    setValue(initialNotes);
    lastSavedRef.current = initialNotes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, area]);

  function persist(next: string) {
    if (next === lastSavedRef.current) return;
    lastSavedRef.current = next;
    update.mutate(next);
  }

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setValue(next);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { timerRef.current = null; persist(next); }, AUTOSAVE_DELAY_MS);
  }

  function onBlur() {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    persist(value);
  }

  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);

  return (
    <section className="flex flex-col gap-2">
      <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
        Notizen
      </label>
      <textarea
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        maxLength={MAX_NOTES}
        placeholder="Freier Notizbereich — Maße, Materialien, Druckvorgaben, To-dos …"
        spellCheck={false}
        className="w-full rounded-lg px-3 py-2 text-sm resize-none"
        style={{
          minHeight: '140px',
          background: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
          fontFamily: 'inherit',
          lineHeight: '1.5',
        }}
      />
      <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
        Wird automatisch gespeichert.
      </p>
    </section>
  );
}

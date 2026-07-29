import { useEffect, useRef, useState } from 'react';
import {
  fetchEventAttachments,
  uploadEventAttachments,
  deleteEventAttachment,
  downloadEventAttachmentUrl,
  type DjEventAttachment,
} from '../../api/dj.api';
import apiClient from '../../api/client';
import { useFilePreview, FilePreviewModal } from '../amazon/FilePreviewModal';

/**
 * Zwei Betriebsarten:
 *  - **Gespeichert-Modus** (`eventId` gesetzt): laedt/uploadet/loescht direkt via API.
 *  - **Entwurfs-Modus** (`eventId` fehlt, z. B. „Neue Anfrage" vor dem Speichern):
 *    arbeitet nur auf `pendingFiles`; der Upload passiert im Eltern-Dialog, sobald
 *    die Anfrage angelegt wurde. Kein API-Zugriff, keine verwaisten Dateien bei Abbruch.
 */
interface Props {
  eventId?: number;
  pendingFiles?: File[];
  onAddFiles?: (files: File[]) => void;
  onRemoveFile?: (index: number) => void;
}

function formatBytes(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function iconForMime(mime: string | null, name: string): string {
  const m = (mime ?? '').toLowerCase();
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (m.startsWith('image/')) return 'image';
  if (m === 'application/pdf' || ext === 'pdf') return 'picture_as_pdf';
  if (m.includes('word') || ['doc', 'docx'].includes(ext)) return 'description';
  if (m.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'table_chart';
  if (['eml', 'msg'].includes(ext)) return 'mail';
  if (['zip', 'rar', '7z'].includes(ext)) return 'folder_zip';
  return 'attach_file';
}

export function EventAttachmentsSection({ eventId, pendingFiles, onAddFiles, onRemoveFile }: Props) {
  const [items, setItems] = useState<DjEventAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const { preview, open: openPreview, close: closePreview } = useFilePreview();

  const isDraft = !eventId;
  const draftFiles = pendingFiles ?? [];
  const count = isDraft ? draftFiles.length : items.length;

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    fetchEventAttachments(eventId)
      .then(setItems)
      .catch(() => setError('Anhänge konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [eventId]);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);

    // Entwurfs-Modus: nur sammeln, der Upload folgt nach dem Anlegen der Anfrage.
    if (isDraft) {
      onAddFiles?.(arr);
      if (fileInput.current) fileInput.current.value = '';
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const created = await uploadEventAttachments(eventId!, arr);
      setItems(prev => [...created, ...prev]);
    } catch {
      setError('Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  /** Vorschau eines bereits gespeicherten Anhangs (Blob via Download-Route laden). */
  async function handlePreviewSaved(att: DjEventAttachment) {
    try {
      const url = downloadEventAttachmentUrl(eventId!, att.id);
      const res = await apiClient.get(url.replace(apiClient.defaults.baseURL ?? '', ''), {
        responseType: 'blob',
      });
      // close() im Modal gibt die URL wieder frei — daher bei jedem Oeffnen neu erzeugen.
      openPreview(URL.createObjectURL(res.data as Blob), att.mime_type, att.original_name);
    } catch {
      setError('Vorschau konnte nicht geladen werden.');
    }
  }

  /** Vorschau einer noch nicht hochgeladenen Datei (direkt aus dem File-Objekt). */
  function handlePreviewDraft(file: File) {
    openPreview(URL.createObjectURL(file), file.type || null, file.name);
  }

  /** Beide Modi auf eine gemeinsame Zeilen-Struktur bringen — ein Render-Pfad. */
  const rows = isDraft
    ? draftFiles.map((file, index) => ({
        key: `draft-${index}-${file.name}`,
        icon: iconForMime(file.type, file.name),
        name: file.name,
        meta: `${formatBytes(file.size)} · wird beim Speichern hochgeladen`,
        onPreview: () => handlePreviewDraft(file),
        onDownload: null as (() => void) | null,
        onDelete: () => onRemoveFile?.(index),
      }))
    : items.map(att => ({
        key: `att-${att.id}`,
        icon: iconForMime(att.mime_type, att.original_name),
        name: att.original_name,
        meta: `${formatBytes(att.size_bytes)}${att.size_bytes != null ? ' · ' : ''}${new Date(att.uploaded_at).toLocaleDateString('de-DE')}`,
        onPreview: () => { void handlePreviewSaved(att); },
        onDownload: (() => { void handleDownload(att); }) as (() => void) | null,
        onDelete: () => { void handleDelete(att); },
      }));

  // Paste-Handler fuer Screenshots aus der Zwischenablage (Cmd+V).
  // Greift global, solange die Komponente gemounted ist (Modal offen).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      // Wenn aktiver Fokus auf Input/Textarea liegt: Paste dort durchlassen.
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase() ?? '';
      if (tag === 'input' || tag === 'textarea' || (t?.isContentEditable ?? false)) return;

      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const blob = it.getAsFile();
          if (blob) {
            const ext = it.type === 'image/png' ? 'png' : it.type === 'image/jpeg' ? 'jpg' : 'bin';
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            files.push(new File([blob], `screenshot_${ts}.${ext}`, { type: it.type }));
          }
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void handleFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, isDraft]);

  async function handleDelete(att: DjEventAttachment) {
    if (!window.confirm(`„${att.original_name}" wirklich löschen?`)) return;
    try {
      await deleteEventAttachment(eventId!, att.id);
      setItems(prev => prev.filter(x => x.id !== att.id));
    } catch {
      setError('Löschen fehlgeschlagen.');
    }
  }

  // Download mit Auth-Header (JWT) — wir laden die Datei via axios und triggern dann den Browser-Download
  async function handleDownload(att: DjEventAttachment) {
    try {
      const url = downloadEventAttachmentUrl(eventId!, att.id);
      const res = await apiClient.get(url.replace(apiClient.defaults.baseURL ?? '', ''), {
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = att.original_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      setError('Download fehlgeschlagen.');
    }
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '0.625rem',
      }}>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.7rem',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-on-surface-variant)',
        }}>
          Anhänge {count > 0 && <span style={{ marginLeft: '0.25rem', color: '#94aaff' }}>({count})</span>}
        </div>
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
          style={{
            background: 'linear-gradient(135deg, #94aaff 0%, #5cfd80 100%)',
            color: '#060e20',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.375rem 0.875rem',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: uploading ? 'progress' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{uploading ? 'progress_activity' : 'upload'}</span>
          {uploading ? 'Lade hoch…' : 'Datei hinzufügen'}
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => { void handleFiles(e.target.files); }}
        />
      </div>

      {error && (
        <div style={{
          background: 'rgba(255,110,132,0.1)',
          border: '1px solid rgba(255,110,132,0.3)',
          borderRadius: '0.5rem',
          padding: '0.5rem 0.75rem',
          fontSize: '0.8rem',
          color: '#ff6464',
          marginBottom: '0.625rem',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>Lade…</div>
      ) : count === 0 ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
          style={{
            padding: '1.5rem 1rem',
            textAlign: 'center',
            background: isDragOver ? 'rgba(92,253,128,0.08)' : 'rgba(255,255,255,0.02)',
            border: `1px dashed ${isDragOver ? 'rgba(92,253,128,0.6)' : 'rgba(148,170,255,0.2)'}`,
            borderRadius: '0.5rem',
            fontSize: '0.8rem',
            color: 'var(--color-on-surface-variant)',
            fontStyle: 'italic',
            transition: 'all 150ms',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 28, opacity: 0.5, display: 'block', marginBottom: '0.375rem' }}>
            {isDragOver ? 'file_download_done' : 'cloud_upload'}
          </span>
          {isDragOver
            ? 'Loslassen zum Hochladen'
            : 'Hier Dateien reinziehen, Screenshot mit ⌘V einfügen oder „Datei hinzufügen" klicken (E-Mails .eml, PDFs, Bilder)'}
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            void handleFiles(e.dataTransfer.files);
          }}
          style={{
            display: 'flex', flexDirection: 'column', gap: '0.375rem',
            padding: isDragOver ? '0.5rem' : 0,
            border: isDragOver ? '1px dashed rgba(92,253,128,0.6)' : '1px dashed transparent',
            background: isDragOver ? 'rgba(92,253,128,0.04)' : 'transparent',
            borderRadius: '0.5rem',
            transition: 'all 150ms',
          }}
        >
          {rows.map(row => (
            <div
              key={row.key}
              onClick={row.onPreview}
              title="Klicken für Vorschau"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148,170,255,0.12)',
                borderRadius: '0.5rem',
                cursor: 'pointer',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#94aaff', flexShrink: 0 }}>
                {row.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.825rem',
                  color: 'var(--color-on-surface)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }} title={row.name}>
                  {row.name}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: 'var(--color-on-surface-variant)',
                }}>
                  {row.meta}
                </div>
              </div>
              {row.onDownload && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); row.onDownload!(); }}
                  title="Herunterladen"
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(148,170,255,0.25)',
                    color: '#94aaff',
                    borderRadius: '0.375rem',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
                </button>
              )}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); row.onDelete(); }}
                title={isDraft ? 'Entfernen' : 'Löschen'}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,110,132,0.25)',
                  color: '#ff6464',
                  borderRadius: '0.375rem',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{isDraft ? 'close' : 'delete'}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <FilePreviewModal preview={preview} onClose={closePreview} />
    </div>
  );
}

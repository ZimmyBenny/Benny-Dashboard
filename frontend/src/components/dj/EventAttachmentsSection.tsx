import { useEffect, useRef, useState } from 'react';
import {
  fetchEventAttachments,
  uploadEventAttachments,
  deleteEventAttachment,
  downloadEventAttachmentUrl,
  type DjEventAttachment,
} from '../../api/dj.api';
import apiClient from '../../api/client';

interface Props {
  eventId: number;
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

export function EventAttachmentsSection({ eventId }: Props) {
  const [items, setItems] = useState<DjEventAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    fetchEventAttachments(eventId)
      .then(setItems)
      .catch(() => setError('Anhänge konnten nicht geladen werden.'))
      .finally(() => setLoading(false));
  }, [eventId]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const arr = Array.from(files);
      const created = await uploadEventAttachments(eventId, arr);
      setItems(prev => [...created, ...prev]);
    } catch {
      setError('Upload fehlgeschlagen.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function handleDelete(att: DjEventAttachment) {
    if (!window.confirm(`„${att.original_name}" wirklich löschen?`)) return;
    try {
      await deleteEventAttachment(eventId, att.id);
      setItems(prev => prev.filter(x => x.id !== att.id));
    } catch {
      setError('Löschen fehlgeschlagen.');
    }
  }

  // Download mit Auth-Header (JWT) — wir laden die Datei via axios und triggern dann den Browser-Download
  async function handleDownload(att: DjEventAttachment) {
    try {
      const url = downloadEventAttachmentUrl(eventId, att.id);
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
          Anhänge {items.length > 0 && <span style={{ marginLeft: '0.25rem', color: '#94aaff' }}>({items.length})</span>}
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
      ) : items.length === 0 ? (
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
            : 'Hier Dateien reinziehen oder „Datei hinzufügen" klicken (E-Mails .eml, PDFs, Bilder)'}
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
          {items.map(att => (
            <div
              key={att.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148,170,255,0.12)',
                borderRadius: '0.5rem',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#94aaff', flexShrink: 0 }}>
                {iconForMime(att.mime_type, att.original_name)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.825rem',
                  color: 'var(--color-on-surface)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }} title={att.original_name}>
                  {att.original_name}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.7rem',
                  color: 'var(--color-on-surface-variant)',
                }}>
                  {formatBytes(att.size_bytes)}
                  {att.size_bytes != null && ' · '}
                  {new Date(att.uploaded_at).toLocaleDateString('de-DE')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { void handleDownload(att); }}
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
              <button
                type="button"
                onClick={() => { void handleDelete(att); }}
                title="Löschen"
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
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

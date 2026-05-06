/**
 * DropzoneBelege — Drag&Drop fuer Beleg-Uploads (Phase 04 Plan 09).
 *
 * Wrapper um `react-dropzone` mit DJ-Stil-Border, Glassmorphism-Hover und
 * Material-Symbol. Akzeptiert PDF/JPG/PNG bis zur uebergebenen MB-Grenze
 * (laeuft im Bound mit dem backend-seitigen `max_upload_size_mb`-Setting).
 *
 * Multi-File-Drop ist erlaubt — der Caller bekommt das File[]-Array und
 * fuehrt einen einzigen `uploadReceipts(files)`-Call aus (siehe belege.api).
 *
 * Sicherheit (Defense-in-Depth, Threat T-04-UI-UPLOAD-01):
 *  - `accept`-Map prueft MIME + Extension auf Browser-Ebene.
 *  - Backend (`belege.upload.routes.ts`) prueft `path.extname.toLowerCase`
 *    erneut — `.pdf.exe` wird bei beiden Schichten abgewiesen.
 */
import { useDropzone, type FileRejection } from 'react-dropzone';

export interface DropzoneBelegeProps {
  /** Wird mit den akzeptierten Files aufgerufen (idR direkt an `uploadReceipts(files)`). */
  onDrop: (files: File[]) => void;
  /** Optional — wird mit abgelehnten Files (zu gross / falscher Typ) aufgerufen. */
  onReject?: (
    rejected: { file: File; errors: { code: string; message: string }[] }[],
  ) => void;
  /** Max-Groesse pro File in MB (sollte mit backend max_upload_size_mb uebereinstimmen). */
  maxSizeMb: number;
  /** Drop deaktivieren (z.B. waehrend laufendem Upload). */
  disabled?: boolean;
}

export function DropzoneBelege({
  onDrop,
  onReject,
  maxSizeMb,
  disabled,
}: DropzoneBelegeProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
    },
    maxSize: maxSizeMb * 1024 * 1024,
    multiple: true,
    disabled,
    onDrop,
    onDropRejected: (rejected: FileRejection[]) =>
      onReject?.(
        rejected.map((r) => ({
          file: r.file as File,
          errors: r.errors.map((e) => ({ code: e.code, message: e.message })),
        })),
      ),
  });

  return (
    <div
      {...getRootProps()}
      style={{
        border: `2px dashed ${isDragActive ? '#94aaff' : 'rgba(148,170,255,0.3)'}`,
        borderRadius: '0.75rem',
        padding: '3rem',
        textAlign: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: isDragActive
          ? 'rgba(148,170,255,0.06)'
          : 'rgba(255,255,255,0.02)',
        transition: 'all 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input {...getInputProps()} />
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: '3rem',
          color: '#94aaff',
          display: 'block',
          marginBottom: '1rem',
        }}
      >
        cloud_upload
      </span>
      <p
        style={{
          fontSize: '1rem',
          color: 'var(--color-on-surface)',
          margin: 0,
        }}
      >
        {isDragActive
          ? 'Dateien hier ablegen'
          : 'Belege hier ablegen oder klicken'}
      </p>
      <p
        style={{
          fontSize: '0.8rem',
          color: 'var(--color-on-surface-variant)',
          margin: '0.5rem 0 0',
        }}
      >
        PDF, JPG, PNG bis {maxSizeMb} MB — mehrere Dateien möglich
      </p>
    </div>
  );
}

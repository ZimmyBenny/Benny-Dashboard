import { useEffect, useState } from 'react';
import { useDraggableModal } from '../../../hooks/useDraggableModal';
import {
  useSampleInspection, useSaveInspectionResult, useSaveInspectionNotes,
} from '../../../hooks/amazon/useSampleInspection';
import { type ManufacturerSample, type InspectionStatus, type InspectionPoint } from '../../../api/amazon.api';

const IST_OPTS: { value: InspectionStatus; label: string }[] = [
  { value: 'offen', label: 'Offen' },
  { value: 'erfuellt', label: 'Erfüllt' },
  { value: 'teilweise', label: 'Teilweise' },
  { value: 'nicht', label: 'Nicht erfüllt' },
];
const IST_COLOR: Record<InspectionStatus, string> = {
  erfuellt: '#10b981', teilweise: '#f59e0b', nicht: '#ef4444', offen: 'var(--color-on-surface-variant)',
};
// Hersteller-Angabe (USP-Feasibility) -> kurzes Label fuer "Soll"
const SOLL_LABEL: Record<string, string> = { umsetzbar: 'Ja', teilweise: 'Teilweise', nicht: 'Nein', offen: 'Offen' };

const INPUT: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '0.375rem',
};

function InspectionRow({ index, point, onSave }: {
  index: number;
  point: InspectionPoint;
  onSave: (pointId: number, status: InspectionStatus, note: string | null) => void;
}) {
  const [status, setStatus] = useState<InspectionStatus>(point.ist_status);
  const [note, setNote] = useState(point.ist_note ?? '');
  useEffect(() => { setStatus(point.ist_status); }, [point.ist_status]);
  useEffect(() => { setNote(point.ist_note ?? ''); }, [point.ist_note]);

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start gap-2 mb-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--color-on-surface-variant)', minWidth: 20 }}>{index}.</span>
        <div className="flex-1">
          <div className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>{point.title}</div>
          {point.body && <div className="text-xs mt-0.5 whitespace-pre-wrap" style={{ color: 'var(--color-on-surface-variant)' }}>{point.body}</div>}
          {point.questions.map((q, i) => (
            <div key={i} className="text-xs mt-0.5" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.85 }}>Frage: {q}</div>
          ))}
        </div>
        {point.soll_status && (
          <span className="text-xs px-2 py-0.5 rounded whitespace-nowrap" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
            title="Hersteller-Angabe aus dem USP">
            Soll: {SOLL_LABEL[point.soll_status] ?? point.soll_status}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={status}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => { const s = e.target.value as InspectionStatus; setStatus(s); onSave(point.id, s, note.trim() === '' ? null : note); }}
          className="px-2 py-1 rounded text-xs font-semibold"
          style={{ ...INPUT, color: IST_COLOR[status] }}
        >
          {IST_OPTS.map(o => <option key={o.value} value={o.value} style={{ color: 'var(--color-on-surface)' }}>{o.label}</option>)}
        </select>
        <input
          value={note}
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => { if ((note.trim() === '' ? null : note) !== point.ist_note) onSave(point.id, status, note.trim() === '' ? null : note); }}
          placeholder="Bemerkung / Messwert …"
          className="flex-1 min-w-[200px] px-2 py-1 rounded text-sm"
          style={INPUT}
        />
      </div>
    </div>
  );
}

export function SamplePruefberichtModal({ productId, mId, sample, onClose }: {
  productId: number; mId: number; sample: ManufacturerSample; onClose: () => void;
}) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const { data, isLoading, isError } = useSampleInspection(productId, mId, sample.id);
  const saveResult = useSaveInspectionResult(productId, mId, sample.id);
  const saveNotes = useSaveInspectionNotes(productId, mId, sample.id);

  const [notes, setNotes] = useState('');
  useEffect(() => { setNotes(data?.inspection_notes ?? ''); }, [data?.inspection_notes]);

  const total = data?.points.length ?? 0;
  const erfuellt = data?.points.filter(p => p.ist_status === 'erfuellt').length ?? 0;

  async function handlePdf() {
    if (!data) return;
    const { exportSamplePruefberichtPdf } = await import('../../../lib/amazon/exportSamplePruefberichtPdf');
    const { blob, filename } = exportSamplePruefberichtPdf(
      {
        productName: data.product_name,
        marke: data.marke,
        manufacturerName: data.manufacturer_name,
        sampleLabel: sample.bezeichnung,
        receivedDate: sample.received_date,
        sendungsnummer: sample.sendungsnummer,
      },
      data.points,
      notes,
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  const labelStyle: React.CSSProperties = { color: 'var(--color-on-surface-variant)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.04em' };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}>
      <div
        data-draggable-modal
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(760px, 96vw)', maxHeight: '92vh',
          background: 'var(--color-surface-container)', borderRadius: '1rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
          ...modalStyle,
        }}
      >
        {/* Drag-Header */}
        <div
          onMouseDown={onMouseDown}
          className="flex items-center justify-between gap-3"
          style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-surface-container-high)', ...headerStyle }}
        >
          <div style={{ fontFamily: 'var(--font-headline)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--color-on-surface)' }}>
            Prüfbericht — {sample.bezeichnung || 'Sample'}
          </div>
          <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={onClose}
            className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--color-on-surface-variant)' }} aria-label="Schließen">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <div style={{ padding: '1.25rem', overflowY: 'auto' }}>
          {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Prüfbericht …</p>}
          {isError && <p style={{ color: '#fca5a5' }}>Prüfbericht konnte nicht geladen werden.</p>}
          {data && (
            <>
              {/* Kopf */}
              <div className="grid gap-x-4 gap-y-2 mb-4" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
                <div><div style={labelStyle}>Produkt</div><div className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{data.product_name}</div></div>
                <div><div style={labelStyle}>Marke</div><div className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{data.marke || '—'}</div></div>
                <div><div style={labelStyle}>Hersteller</div><div className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{data.manufacturer_name}</div></div>
                <div><div style={labelStyle}>Erhalten am</div><div className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{sample.received_date || '—'}</div></div>
                <div><div style={labelStyle}>Sendungsnr.</div><div className="text-sm" style={{ color: 'var(--color-on-surface)' }}>{sample.sendungsnummer || '—'}</div></div>
                <div><div style={labelStyle}>Erfüllt</div><div className="text-sm font-semibold" style={{ color: '#10b981' }}>{erfuellt} von {total}</div></div>
              </div>

              {/* Prüfzeilen */}
              <div className="flex flex-col gap-2">
                {data.points.length === 0 && (
                  <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Keine USP-Anforderungen vorhanden. Lege zuerst USP-Punkte beim Produkt an.</p>
                )}
                {data.points.map((p, i) => (
                  <InspectionRow key={p.id} index={i + 1} point={p}
                    onSave={(pointId, status, note) => saveResult.mutate({ pointId, status, note })} />
                ))}
              </div>

              {/* Zusatz-Notizen */}
              <div className="mt-4">
                <div style={labelStyle} className="mb-1">Zusatz-Notizen</div>
                <textarea
                  value={notes}
                  onMouseDown={(e) => e.stopPropagation()}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => { if (notes !== (data.inspection_notes ?? '')) saveNotes.mutate(notes.trim() === '' ? null : notes); }}
                  placeholder="Allgemeine Notizen zum Prüfbericht …"
                  rows={4}
                  className="w-full px-2 py-1.5 rounded text-sm"
                  style={INPUT}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2" style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--color-surface-container-high)' }}>
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
            Schließen
          </button>
          <button type="button" onClick={handlePdf} disabled={!data}
            className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>print</span>PDF drucken
          </button>
        </div>
      </div>
    </div>
  );
}

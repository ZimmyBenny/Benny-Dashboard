import { useEffect, useRef, useState } from 'react';
import { type UspPoint, type UspPointQuestion } from '../../../api/amazon.api';
import {
  useUpdateUspPoint, useUploadUspPointImage,
  useCreateUspPointQuestion, useUpdateUspPointQuestion, useDeleteUspPointQuestion,
} from '../../../hooks/amazon/useUsp';
import { UspPointImages } from './UspPointImages';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function QuestionItem({ productId, pointId, q }: { productId: number; pointId: number; q: UspPointQuestion }) {
  const update = useUpdateUspPointQuestion(productId);
  const del = useDeleteUspPointQuestion(productId);
  const [text, setText] = useState(q.text);
  useEffect(() => { setText(q.text); }, [q.text]);
  return (
    <div className="flex items-center gap-1">
      <input value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== q.text) update.mutate({ pointId, qId: q.id, text }); }}
        placeholder="Frage an den Hersteller …" className="flex-1 px-2 py-1 rounded-md text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
      <button type="button" onClick={() => del.mutate({ pointId, qId: q.id })} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Frage löschen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}

function QuestionsBlock({ productId, pointId, questions }: { productId: number; pointId: number; questions: UspPointQuestion[] }) {
  const create = useCreateUspPointQuestion(productId);
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Fragen an Hersteller</span>
      {questions.map(q => <QuestionItem key={q.id} productId={productId} pointId={pointId} q={q} />)}
      <button type="button" onClick={() => create.mutate({ pointId })} className="self-start px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>Frage
      </button>
    </div>
  );
}

interface Props {
  productId: number; index: number; point: UspPoint;
  onRequestDelete: (p: UspPoint) => void;
  hasManufacturer: boolean;
  includeInPdf: boolean;
  onToggleInclude: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}
export function UspPointRow({ productId, index, point, onRequestDelete, hasManufacturer, includeInPdf, onToggleInclude, dragHandleProps }: Props) {
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
    <div className="rounded-lg p-4" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.12)', borderLeft: '3px solid #60a5fa', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
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
        {hasManufacturer && (
          <button type="button"
            onClick={onToggleInclude}
            className="px-2 py-1 rounded-md text-xs flex items-center gap-1 flex-shrink-0"
            title={includeInPdf ? 'Im PDF dieses Herstellers — klicken zum Ausschließen' : 'Nicht im PDF dieses Herstellers — klicken zum Aufnehmen'}
            style={{
              background: includeInPdf ? '#34d399' : '#fca5a5',
              color: '#08131f',
              border: '1px solid rgba(255,255,255,0.08)',
              fontWeight: 600,
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>picture_as_pdf</span>
            {includeInPdf ? 'im PDF' : 'kein PDF'}
          </button>
        )}
        <button type="button" onClick={() => onRequestDelete(point)} className="p-1.5 rounded-md" style={{ color: '#fca5a5' }} aria-label="Punkt löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>
      <span className="text-xs uppercase tracking-wide block mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>Anforderungen</span>
      <textarea value={body} onChange={(e) => setBody(e.target.value)}
        onBlur={() => { if (body !== (point.body ?? '')) update.mutate({ pointId: point.id, patch: { body } }); }}
        placeholder="Anforderungen an den Hersteller …" rows={3} className="w-full px-2 py-1.5 rounded-md text-sm"
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
      <QuestionsBlock productId={productId} pointId={point.id} questions={point.questions} />
    </div>
  );
}

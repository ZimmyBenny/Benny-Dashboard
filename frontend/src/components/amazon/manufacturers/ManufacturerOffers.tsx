import { useEffect, useRef, useState } from 'react';
import { type ManufacturerOffer, type OfferFile, getOfferFileObjectUrl } from '../../../api/amazon.api';
import { FilePreviewModal, useFilePreview } from '../FilePreviewModal';
import {
  useCreateOffer,
  useUpdateOffer,
  useDeleteOffer,
  useUploadOfferFile,
  useDeleteOfferFile,
  eurPreis,
} from '../../../hooks/amazon/useManufacturers';

const MAX_BYTES = 20 * 1024 * 1024;

interface OfferFileRowProps {
  productId: number;
  mId: number;
  oId: number;
  file: OfferFile;
  onDelete: () => void;
}

function OfferFileRow({ productId, mId, oId, file, onDelete }: OfferFileRowProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fp = useFilePreview();
  const isImage = (file.mime ?? '').startsWith('image/');
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    let revoked = false; let url: string | null = null;
    getOfferFileObjectUrl(productId, mId, oId, file.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setThumb(u); }).catch(() => setThumb(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [isImage, productId, mId, oId, file.id]);

  async function view() {
    const url = await getOfferFileObjectUrl(productId, mId, oId, file.id);
    fp.open(url, file.mime, file.original_name || 'Datei');
  }
  async function download() {
    const url = await getOfferFileObjectUrl(productId, mId, oId, file.id);
    const a = document.createElement('a'); a.href = url; a.download = file.original_name || 'datei'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {isImage
        ? <button type="button" onClick={view} className="flex-shrink-0 rounded overflow-hidden flex items-center justify-center" style={{ width: 28, height: 28, border: '1px solid rgba(255,255,255,0.08)', background: 'var(--color-surface-container)' }} title="Vorschau">
            {thumb ? <img src={thumb} alt="" className="w-full h-full object-cover" /> : <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--color-on-surface-variant)' }}>image</span>}
          </button>
        : <span className="material-symbols-outlined flex-shrink-0" style={{ fontSize: 14, color: 'var(--color-on-surface-variant)' }}>description</span>}
      <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--color-on-surface)' }} title={file.original_name ?? undefined}>
        {file.original_name || 'Datei'}
      </span>
      {!isImage && (
        <button type="button" onClick={view} className="p-1 rounded-md flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }} aria-label="Datei ansehen" title="Ansehen">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span>
        </button>
      )}
      <button type="button" onClick={download} className="p-1 rounded-md flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }} aria-label="Datei herunterladen">
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>
      </button>
      {confirmDelete ? (
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs" style={{ color: '#fca5a5' }}>Wirklich löschen?</span>
          <button type="button" onClick={() => { onDelete(); setConfirmDelete(false); }} className="px-1.5 py-0.5 rounded-md text-xs" style={{ background: '#7f1d1d', color: '#fecaca' }}>Ja</button>
          <button type="button" onClick={() => setConfirmDelete(false)} className="px-1.5 py-0.5 rounded-md text-xs" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Nein</button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirmDelete(true)} className="p-1 rounded-md flex-shrink-0" style={{ color: '#fca5a5' }} aria-label="Datei löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
        </button>
      )}
      <FilePreviewModal preview={fp.preview} onClose={fp.close} />
    </div>
  );
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

function fmtEur(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Datum aus ISO "YYYY-MM-DD" ODER dt. "TT.MM.JJJJ" -> Zeitstempel (ms). Sonst null.
function parseOfferDate(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return isNaN(d.getTime()) ? null : d.getTime(); }
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(t);
  if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); return isNaN(d.getTime()) ? null : d.getTime(); }
  return null;
}

// Sortier-Schluessel: geparstes Datum (ms) ODER Fallback created_at (auf ms normalisiert).
function offerSortKey(o: ManufacturerOffer): number {
  const d = parseOfferDate(o.datum);
  if (d !== null) return d;
  return o.created_at < 1e12 ? o.created_at * 1000 : o.created_at;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      {children}
    </label>
  );
}

interface OfferCardProps {
  productId: number;
  mId: number;
  offer: ManufacturerOffer;
  rate: number | null;
  isNewest: boolean;
  isCheapest: boolean;
}

function OfferCard({ productId, mId, offer, rate, isNewest, isCheapest }: OfferCardProps) {
  const update = useUpdateOffer(productId);
  const del = useDeleteOffer(productId);
  const uploadFile = useUploadOfferFile(productId);
  const deleteFile = useDeleteOfferFile(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [mengeVariante, setMengeVariante] = useState(offer.menge_variante ?? '');
  const [preis, setPreis] = useState(offer.preis ?? '');
  const [moq, setMoq] = useState(offer.moq ?? '');
  const [lieferzeit, setLieferzeit] = useState(offer.lieferzeit ?? '');
  const [datum, setDatum] = useState(offer.datum ?? '');
  const [notiz, setNotiz] = useState(offer.notiz ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => { setMengeVariante(offer.menge_variante ?? ''); }, [offer.menge_variante]);
  useEffect(() => { setPreis(offer.preis ?? ''); }, [offer.preis]);
  useEffect(() => { setMoq(offer.moq ?? ''); }, [offer.moq]);
  useEffect(() => { setLieferzeit(offer.lieferzeit ?? ''); }, [offer.lieferzeit]);
  useEffect(() => { setDatum(offer.datum ?? ''); }, [offer.datum]);
  useEffect(() => { setNotiz(offer.notiz ?? ''); }, [offer.notiz]);

  function handleFilePick(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setFileError('Datei ist größer als 20 MB.'); return; }
    setFileError(null);
    uploadFile.mutate({ mId, oId: offer.id, file: f });
  }
  function handleFilesPick(fs: FileList | null | undefined) {
    if (!fs) return;
    Array.from(fs).forEach(handleFilePick);
  }

  const eur = eurPreis(offer, rate);
  const isLatest = !!offer.is_latest;
  // "Neuestes" nur zeigen, wenn nicht ohnehin schon "Aktuellstes"
  const showNewest = isNewest && !isLatest;
  const dateInputValue = isIsoDate(datum) ? datum : '';

  return (
    <div className="relative overflow-hidden rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: 'var(--color-surface-container)',
        border: `1px solid ${isLatest ? 'rgba(148,170,255,0.35)' : 'var(--color-outline-variant, rgba(255,255,255,0.08))'}`,
      }}>
      {isLatest && (
        <div className="absolute top-0 left-0 right-0" style={{ height: 3, background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))' }} />
      )}

      {/* Kopf: EUR-Headline + Badges/Aktionen */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>
              {eur !== null ? `${fmtEur(eur)} €` : (preis ? `${preis} ${offer.currency}` : '—')}
            </span>
            {eur !== null && (
              <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
                ({preis || '—'} {offer.currency})
              </span>
            )}
          </div>
          {/* Original-Preis editierbar */}
          <div className="flex items-center gap-2">
            <input
              value={preis}
              onChange={(e) => setPreis(e.target.value)}
              onBlur={() => { if (preis !== (offer.preis ?? '')) update.mutate({ mId, oId: offer.id, patch: { preis } }); }}
              placeholder="Preis"
              className="px-2 py-1 rounded-md text-xs w-24"
              style={INPUT_STYLE}
            />
            <select
              value={offer.currency}
              onChange={(e) => update.mutate({ mId, oId: offer.id, patch: { currency: e.target.value as 'USD' | 'EUR' } })}
              className="px-2 py-1 rounded-md text-xs"
              style={INPUT_STYLE}
            >
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {isLatest && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: 'rgba(148,170,255,0.16)', color: 'var(--color-primary)', border: '1px solid rgba(148,170,255,0.35)' }}>
              Aktuellstes
            </span>
          )}
          {showNewest && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: 'rgba(148,170,255,0.10)', color: 'var(--color-secondary)', border: '1px solid rgba(148,170,255,0.25)' }}>
              Neuestes
            </span>
          )}
          {isCheapest && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: 'rgba(16,185,129,0.16)', color: '#34d399', border: '1px solid rgba(16,185,129,0.45)' }}>
              Günstigstes
            </span>
          )}
          <button
            type="button"
            onClick={() => update.mutate({ mId, oId: offer.id, patch: { is_latest: offer.is_latest ? 0 : 1 } })}
            className="p-1 rounded-md flex-shrink-0"
            style={{ color: isLatest ? '#fbbf24' : 'var(--color-on-surface-variant)' }}
            title={isLatest ? 'Aktuellstes Angebot' : 'Als aktuellstes markieren'}
            aria-label="Aktuellstes Angebot"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: isLatest ? "'FILL' 1" : "'FILL' 0" }}>star</span>
          </button>
          {confirmDelete ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-xs" style={{ color: '#fca5a5' }}>Wirklich löschen?</span>
              <button type="button" onClick={() => { del.mutate({ mId, oId: offer.id }); setConfirmDelete(false); }} className="px-2 py-1 rounded-md text-xs" style={{ background: '#7f1d1d', color: '#fecaca' }}>Ja</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded-md text-xs" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Nein</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="p-1 rounded-md flex-shrink-0" style={{ color: '#fca5a5' }} aria-label="Angebot löschen">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Beschriftete Felder */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Field label="Menge/Variante">
          <input value={mengeVariante} onChange={(e) => setMengeVariante(e.target.value)}
            onBlur={() => { if (mengeVariante !== (offer.menge_variante ?? '')) update.mutate({ mId, oId: offer.id, patch: { menge_variante: mengeVariante } }); }}
            placeholder="z.B. 500 Stk / rot" className="px-2 py-1 rounded-md text-xs w-full" style={INPUT_STYLE} />
        </Field>
        <Field label="MOQ">
          <input value={moq} onChange={(e) => setMoq(e.target.value)}
            onBlur={() => { if (moq !== (offer.moq ?? '')) update.mutate({ mId, oId: offer.id, patch: { moq } }); }}
            placeholder="Mindestmenge" className="px-2 py-1 rounded-md text-xs w-full" style={INPUT_STYLE} />
        </Field>
        <Field label="Lieferzeit">
          <input value={lieferzeit} onChange={(e) => setLieferzeit(e.target.value)}
            onBlur={() => { if (lieferzeit !== (offer.lieferzeit ?? '')) update.mutate({ mId, oId: offer.id, patch: { lieferzeit } }); }}
            placeholder="z.B. 25 Tage" className="px-2 py-1 rounded-md text-xs w-full" style={INPUT_STYLE} />
        </Field>
        <Field label="Datum">
          <input type="date" value={dateInputValue} onChange={(e) => setDatum(e.target.value)}
            onBlur={() => { if (datum !== (offer.datum ?? '')) update.mutate({ mId, oId: offer.id, patch: { datum } }); }}
            className="px-2 py-1 rounded-md text-xs w-full" style={INPUT_STYLE} />
          {datum && !isIsoDate(datum) && (
            <span className="text-[10px]" style={{ color: 'var(--color-on-surface-variant)' }} title="Alter Freitext — wird beim Setzen eines Datums ersetzt">Alt: {datum}</span>
          )}
        </Field>
      </div>

      <Field label="Notiz">
        <textarea value={notiz} onChange={(e) => setNotiz(e.target.value)}
          onBlur={() => { if (notiz !== (offer.notiz ?? '')) update.mutate({ mId, oId: offer.id, patch: { notiz } }); }}
          placeholder="Notiz zum Angebot …" rows={2} className="px-2 py-1 rounded-md text-xs w-full resize-y" style={INPUT_STYLE} />
      </Field>

      {/* Dateien */}
      <div className="flex flex-col gap-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFilesPick(e.dataTransfer.files); }}>
        {offer.files.length > 0 && (
          <div className="flex flex-col gap-1">
            {offer.files.map(f => (
              <OfferFileRow key={f.id} productId={productId} mId={mId} oId={offer.id} file={f}
                onDelete={() => deleteFile.mutate({ mId, oId: offer.id, fId: f.id })} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} title="Klick oder Datei(en) hierher ziehen"
            className="self-start px-2 py-1 rounded-md text-xs flex items-center gap-1"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>upload_file</span>Datei hochladen (oder reinziehen)
          </button>
          {fileError && <span className="text-xs" style={{ color: '#fca5a5' }}>{fileError}</span>}
        </div>
        <input ref={fileInput} type="file" multiple className="hidden"
          onChange={(e) => { handleFilesPick(e.target.files); e.target.value = ''; }} />
      </div>
    </div>
  );
}

interface Props {
  productId: number;
  mId: number;
  offers: ManufacturerOffer[];
  rate: number | null;
}

export function ManufacturerOffers({ productId, mId, offers, rate }: Props) {
  const create = useCreateOffer(productId);

  // Anzeige-Sortierung: neuestes Datum oben (Fallback created_at). Kein Reorder im Backend.
  const sorted = [...offers].sort((a, b) => offerSortKey(b) - offerSortKey(a));
  const newestId = sorted.length > 1 ? sorted[0].id : null;

  // Günstigstes nach EUR-Preis (nur wenn mind. 2 Angebote einen EUR-Preis liefern).
  let cheapestId: number | null = null;
  let cheapestEur = Infinity;
  let priced = 0;
  for (const o of offers) {
    const e = eurPreis(o, rate);
    if (e !== null) { priced += 1; if (e < cheapestEur) { cheapestEur = e; cheapestId = o.id; } }
  }
  if (priced < 2) cheapestId = null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Angebote</span>
      {sorted.map(o => (
        <OfferCard key={o.id} productId={productId} mId={mId} offer={o} rate={rate}
          isNewest={o.id === newestId} isCheapest={o.id === cheapestId} />
      ))}
      <button
        type="button"
        onClick={() => create.mutate(mId)}
        className="self-start px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 mt-1"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>Angebot hinzufügen
      </button>
    </div>
  );
}

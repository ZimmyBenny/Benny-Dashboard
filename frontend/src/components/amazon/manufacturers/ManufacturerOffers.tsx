import { useEffect, useRef, useState } from 'react';
import { type ManufacturerOffer, type OfferFile, getOfferFileObjectUrl } from '../../../api/amazon.api';
import { FilePreviewModal, useFilePreview } from '../FilePreviewModal';
import {
  useCreateOffer,
  useUpdateOffer,
  useDeleteOffer,
  useUploadOfferFile,
  useDeleteOfferFile,
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

interface OfferRowProps {
  productId: number;
  mId: number;
  offer: ManufacturerOffer;
}

function OfferRow({ productId, mId, offer }: OfferRowProps) {
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

  const inputStyle = {
    background: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface)',
    border: '1px solid rgba(255,255,255,0.08)',
  };

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

  return (
    <div className="flex flex-col gap-1.5 py-2 px-2 rounded-md"
      style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Fields row */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={mengeVariante}
          onChange={(e) => setMengeVariante(e.target.value)}
          onBlur={() => { if (mengeVariante !== (offer.menge_variante ?? '')) update.mutate({ mId, oId: offer.id, patch: { menge_variante: mengeVariante } }); }}
          placeholder="Menge/Variante"
          className="px-2 py-1 rounded-md text-xs w-28"
          style={inputStyle}
        />
        <input
          value={preis}
          onChange={(e) => setPreis(e.target.value)}
          onBlur={() => { if (preis !== (offer.preis ?? '')) update.mutate({ mId, oId: offer.id, patch: { preis } }); }}
          placeholder="Preis"
          className="px-2 py-1 rounded-md text-xs w-24"
          style={inputStyle}
        />
        <select
          value={offer.currency}
          onChange={(e) => update.mutate({ mId, oId: offer.id, patch: { currency: e.target.value as 'USD' | 'EUR' } })}
          className="px-2 py-1 rounded-md text-xs"
          style={inputStyle}
        >
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
        </select>
        <input
          value={moq}
          onChange={(e) => setMoq(e.target.value)}
          onBlur={() => { if (moq !== (offer.moq ?? '')) update.mutate({ mId, oId: offer.id, patch: { moq } }); }}
          placeholder="MOQ"
          className="px-2 py-1 rounded-md text-xs w-20"
          style={inputStyle}
        />
        <input
          value={lieferzeit}
          onChange={(e) => setLieferzeit(e.target.value)}
          onBlur={() => { if (lieferzeit !== (offer.lieferzeit ?? '')) update.mutate({ mId, oId: offer.id, patch: { lieferzeit } }); }}
          placeholder="Lieferzeit"
          className="px-2 py-1 rounded-md text-xs w-24"
          style={inputStyle}
        />
        <input
          value={datum}
          onChange={(e) => setDatum(e.target.value)}
          onBlur={() => { if (datum !== (offer.datum ?? '')) update.mutate({ mId, oId: offer.id, patch: { datum } }); }}
          placeholder="Datum"
          className="px-2 py-1 rounded-md text-xs w-24"
          style={inputStyle}
        />
        <input
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          onBlur={() => { if (notiz !== (offer.notiz ?? '')) update.mutate({ mId, oId: offer.id, patch: { notiz } }); }}
          placeholder="Notiz"
          className="px-2 py-1 rounded-md text-xs flex-1 min-w-28"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => update.mutate({ mId, oId: offer.id, patch: { is_latest: offer.is_latest ? 0 : 1 } })}
          className="p-1 rounded-md flex-shrink-0"
          style={{ color: offer.is_latest ? '#fbbf24' : 'var(--color-on-surface-variant)' }}
          title={offer.is_latest ? 'Aktuellstes Angebot' : 'Als aktuellstes markieren'}
          aria-label="Aktuellstes Angebot"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: offer.is_latest ? "'FILL' 1" : "'FILL' 0" }}>star</span>
        </button>
        {confirmDelete ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-xs" style={{ color: '#fca5a5' }}>Wirklich löschen?</span>
            <button
              type="button"
              onClick={() => { del.mutate({ mId, oId: offer.id }); setConfirmDelete(false); }}
              className="px-2 py-1 rounded-md text-xs"
              style={{ background: '#7f1d1d', color: '#fecaca' }}
            >
              Ja
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-1 rounded-md text-xs"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
            >
              Nein
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="p-1 rounded-md flex-shrink-0"
            style={{ color: '#fca5a5' }}
            aria-label="Angebot löschen"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
          </button>
        )}
      </div>
      {/* File area */}
      <div className="flex flex-col gap-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFilesPick(e.dataTransfer.files); }}>
        {offer.files.length > 0 && (
          <div className="flex flex-col gap-1">
            {offer.files.map(f => (
              <OfferFileRow
                key={f.id}
                productId={productId}
                mId={mId}
                oId={offer.id}
                file={f}
                onDelete={() => deleteFile.mutate({ mId, oId: offer.id, fId: f.id })}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            title="Klick oder Datei(en) hierher ziehen"
            className="self-start px-2 py-1 rounded-md text-xs flex items-center gap-1"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>upload_file</span>Datei hochladen (oder reinziehen)
          </button>
          {fileError && <span className="text-xs" style={{ color: '#fca5a5' }}>{fileError}</span>}
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { handleFilesPick(e.target.files); e.target.value = ''; }}
        />
      </div>
    </div>
  );
}

interface Props {
  productId: number;
  mId: number;
  offers: ManufacturerOffer[];
}

export function ManufacturerOffers({ productId, mId, offers }: Props) {
  const create = useCreateOffer(productId);
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Angebote</span>
      {offers.map(o => (
        <OfferRow key={o.id} productId={productId} mId={mId} offer={o} />
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

import { useEffect, useRef, useState } from 'react';
import { getUspLogoObjectUrl, type UspMeta } from '../../../api/amazon.api';
import { useUpdateUspMeta, useUploadUspLogo, useDeleteUspLogo } from '../../../hooks/amazon/useUsp';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function Field({ label, value, onSave, textarea }: { label: string; value: string; onSave: (v: string) => void; textarea?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const common = {
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: () => { if (v !== value) onSave(v); },
    className: 'w-full px-2 py-1.5 rounded-md text-sm',
    style: { background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' },
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      {textarea ? <textarea rows={2} {...common} /> : <input {...common} />}
    </label>
  );
}

function LogoBlock({ productId, meta }: { productId: number; meta: UspMeta }) {
  const upload = useUploadUspLogo(productId);
  const remove = useDeleteUspLogo(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false; let url: string | null = null;
    if (!meta.logo_path) { setSrc(null); return; }
    getUspLogoObjectUrl(productId).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, meta.logo_path]);

  function pick(file: File | undefined | null) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) { setError('Nur JPG, PNG oder WEBP.'); return; }
    if (file.size > MAX_BYTES) { setError('Bild ist größer als 5 MB.'); return; }
    setError(null); upload.mutate(file);
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Logo</span>
      <div className="flex items-center gap-3"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
        <button type="button" onClick={() => fileInput.current?.click()}
          className="rounded-md flex items-center justify-center overflow-hidden"
          style={{ width: 96, height: 96, background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.08)' }}
          aria-label={meta.logo_path ? 'Logo ersetzen' : 'Logo hinzufügen'}>
          {src
            ? <img src={src} alt="Logo" className="w-full h-full object-contain" />
            : <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--color-on-surface-variant)', opacity: 0.5 }}>image</span>}
        </button>
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => fileInput.current?.click()}
            className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{meta.logo_path ? 'photo_camera' : 'add_photo_alternate'}</span>
            {meta.logo_path ? 'Ersetzen' : 'Logo hochladen'}
          </button>
          {meta.logo_path && (
            <button type="button" onClick={() => remove.mutate()}
              className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
              style={{ background: 'var(--color-surface-container-high)', color: '#fca5a5' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>Entfernen
            </button>
          )}
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>JPG/PNG/WEBP, max 5 MB. Erscheint oben im PDF.</span>
        </div>
      </div>
      {error && <p className="text-xs" style={{ color: '#fca5a5' }}>{error}</p>}
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

function MarkeField({ marke, finalMarke, onSave }: { marke: string | null; finalMarke: string | null; onSave: (v: string) => void }) {
  const [v, setV] = useState(marke ?? '');
  useEffect(() => { setV(marke ?? ''); }, [marke]);

  // Markierte Marke (aus dem Markenname-Modul) gewinnt IMMER. Solange dort eine Marke
  // markiert ist, wird sie schreibgeschuetzt angezeigt — keine abweichende Handeingabe.
  if (finalMarke) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Marke</span>
        <div
          className="w-full px-2 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {finalMarke}
        </div>
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Im Markenname markiert — dort änderbar.</span>
      </div>
    );
  }

  // Fallback: keine Marke markiert -> manuelle Eingabe weiterhin moeglich (alte Daten bleiben erhalten)
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Marke</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (marke ?? '')) onSave(v); }}
        placeholder="Marke (oder im Markenname markieren)"
        className="w-full px-2 py-1.5 rounded-md text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
      />
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Noch keine Marke im Markenname markiert.</span>
    </label>
  );
}

export function UspMetaForm({ productId, meta, finalMarke }: { productId: number; meta: UspMeta; finalMarke: string | null }) {
  const update = useUpdateUspMeta(productId);
  return (
    <div className="flex flex-col gap-3 mb-4">
      <MarkeField marke={meta.marke} finalMarke={finalMarke} onSave={(marke) => update.mutate({ marke })} />
      <LogoBlock productId={productId} meta={meta} />
      <Field label="Hauptfokus" value={meta.hauptfokus ?? ''} onSave={(hauptfokus) => update.mutate({ hauptfokus })} textarea />
    </div>
  );
}

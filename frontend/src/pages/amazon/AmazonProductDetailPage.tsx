import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import {
  useAmazonProducts,
  useUploadAmazonProductImage,
  useDeleteAmazonProductImage,
} from '../../hooks/amazon/useAmazonProducts';
import {
  getAmazonProductImageObjectUrl,
  type AmazonProduct,
} from '../../api/amazon.api';
import { ProductStatusBadge } from '../../components/amazon/ProductStatusBadge';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Nur JPG, PNG oder WEBP.';
  if (file.size > MAX_BYTES) return 'Bild ist groesser als 5 MB.';
  return null;
}

function ProductImageLarge({ product }: { product: AmazonProduct }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    if (!product.image_path) { setSrc(null); return; }
    getAmazonProductImageObjectUrl(product.id)
      .then(url => {
        if (revoked) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [product.id, product.image_path]);

  if (!src) {
    return (
      <div
        className="aspect-[4/3] w-full rounded-lg flex items-center justify-center"
        style={{ background: 'var(--color-surface-container-low)' }}
      >
        <span
          className="material-symbols-outlined text-6xl"
          style={{ color: 'var(--color-on-surface-variant)', opacity: 0.4 }}
        >
          image
        </span>
      </div>
    );
  }
  return (
    <div
      className="aspect-[4/3] w-full rounded-lg flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--color-surface-container-lowest)' }}
    >
      <img src={src} alt={product.name} className="w-full h-full object-contain" />
    </div>
  );
}

export function AmazonProductDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const id = Number(idParam);

  const { data: products = [], isLoading } = useAmazonProducts(true);
  const product = products.find(p => p.id === id);

  const upload = useUploadAmazonProductImage();
  const removeImage = useDeleteAmazonProductImage();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handlePickFile(f: File | undefined | null) {
    if (!f || !product) return;
    const msg = validateFile(f);
    if (msg) { setError(msg); return; }
    setError(null);
    upload.mutate({ id: product.id, file: f });
  }

  // Paste-Support (Cmd+V)
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!Number.isInteger(id)) {
    return (
      <PageWrapper>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Ungueltige Produkt-ID.</p>
      </PageWrapper>
    );
  }

  if (isLoading) {
    return (
      <PageWrapper>
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Produkt …</p>
      </PageWrapper>
    );
  }

  if (!product) {
    return (
      <PageWrapper>
        <div className="flex flex-col gap-3">
          <p style={{ color: 'var(--color-on-surface)' }}>Produkt nicht gefunden.</p>
          <Link
            to="/amazon"
            className="px-3 py-1.5 rounded-md text-sm self-start"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
          >
            Zurueck zur Uebersicht
          </Link>
        </div>
      </PageWrapper>
    );
  }

  const uploading = upload.isPending || removeImage.isPending;

  return (
    <PageWrapper>
      {/* Header: Back-Button + Titel + Status-Badge */}
      <header className="flex items-center gap-4 mb-6">
        <button
          type="button"
          onClick={() => navigate('/amazon')}
          aria-label="Zurueck"
          className="p-2 rounded-md"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h1
            className="text-2xl font-bold truncate"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            {product.name}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Erstellt am {new Date(product.created_at * 1000).toLocaleDateString('de-DE')}
          </p>
        </div>
        <ProductStatusBadge productId={product.id} status={product.status} />
      </header>

      {/* Zwei-Spalten-Layout: Bild links, Felder rechts */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Bild-Bereich */}
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handlePickFile(e.dataTransfer.files?.[0]);
            }}
            className="block w-full"
            disabled={uploading}
            aria-label={product.image_path ? 'Bild ersetzen' : 'Bild hinzufuegen'}
          >
            <ProductImageLarge product={product} />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              handlePickFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="flex-1 px-3 py-2 rounded-md text-sm flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <span className="material-symbols-outlined text-base">photo_camera</span>
              {product.image_path ? 'Ersetzen' : 'Hochladen'}
            </button>
            {product.image_path && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  removeImage.mutate(product.id);
                }}
                disabled={uploading}
                className="px-3 py-2 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
                style={{ background: 'var(--color-surface-container-high)', color: '#fca5a5' }}
              >
                <span className="material-symbols-outlined text-base">delete</span>
                Entfernen
              </button>
            )}
          </div>

          <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
            Auch per Drag&amp;Drop oder Cmd+V einfuegbar. JPG/PNG/WEBP, max 5 MB.
          </p>
          {error && <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>}
        </section>

        {/* Felder-Spalte (vorerst leer) */}
        <section
          className="rounded-xl p-5"
          style={{
            background: 'var(--color-surface-container-low)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <h2 className="font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
            Details
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Felder fuer USP, Marge, Sourcing, Notizen und Tags folgen in den naechsten Schritten.
          </p>
        </section>
      </div>
    </PageWrapper>
  );
}

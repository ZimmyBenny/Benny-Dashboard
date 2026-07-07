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
import { SourcingSection } from '../../components/amazon/SourcingSection';
import { ChecklistSection } from '../../components/amazon/checklist/ChecklistSection';
import { ProductNotes } from '../../components/amazon/ProductNotes';
import { AutosaveIndicator } from '../../components/amazon/AutosaveIndicator';
import { DraggableSectionList } from '../../components/amazon/DraggableSectionList';
import { useDetailSectionOrder, type DetailSectionId } from '../../hooks/amazon/useDetailSectionOrder';
import { UspSection } from '../../components/amazon/usp/UspSection';
import { ManufacturersSection } from '../../components/amazon/manufacturers/ManufacturersSection';
import { ResearchSection } from '../../components/amazon/research/ResearchSection';
import { ListingSection } from '../../components/amazon/listing/ListingSection';
import { DesignDruckSection } from '../../components/amazon/productdocs/DesignDruckSection';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Nur JPG, PNG oder WEBP.';
  if (file.size > MAX_BYTES) return 'Bild ist größer als 5 MB.';
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
  const { order: sectionOrder, move: moveSection } = useDetailSectionOrder();

  function handlePickFile(f: File | undefined | null) {
    if (!f || !product) return;
    const msg = validateFile(f);
    if (msg) { setError(msg); return; }
    setError(null);
    upload.mutate({ id: product.id, file: f });
  }

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
            to="/amazon/entwicklung"
            className="px-3 py-1.5 rounded-md text-sm self-start"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
          >
            Zurück zur Übersicht
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
          onClick={() => navigate('/amazon/entwicklung')}
          aria-label="Zurück"
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
        <ProductStatusBadge productId={product.id} status={product.status} align="right" />
      </header>

      {/* Bild oben (begrenzt), Sektionen darunter mit voller Breite */}
      <div className="flex flex-col gap-6">
        {/* Bild + Notizen nebeneinander */}
        <div className="flex flex-col md:flex-row gap-4 items-stretch">
        {/* Bild-Bereich */}
        <section className="flex flex-col gap-3 w-full md:w-[420px] md:flex-shrink-0">
          {/* Bild ist reine Anzeige — geaendert wird AUSSCHLIESSLICH ueber die Knoepfe "Ersetzen"/"Entfernen".
              Kein Klick-aufs-Bild, kein Drag&Drop, kein Cmd+V — verhindert versehentliches Ueberschreiben. */}
          <div className="block w-full">
            <ProductImageLarge product={product} />
          </div>
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

          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 disabled:opacity-50"
              style={{
                background: 'var(--color-surface-container-high)',
                color: 'var(--color-on-surface)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_camera</span>
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
                className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: 'var(--color-surface-container-high)', color: '#fca5a5' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete</span>
                Entfernen
              </button>
            )}
          </div>

          {error && <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>}
        </section>

        <ProductNotes productId={product.id} initialNotes={product.notes} />
        </div>

        {/* Sektionen — volle Breite, sortierbar via Drag am Header */}
        <DraggableSectionList<DetailSectionId>
          items={sectionOrder.map(id => ({
            id,
            render: () => {
              if (id === 'sourcing') return <SourcingSection productId={product.id} />;
              if (id === 'usp') return <UspSection productId={product.id} productName={product.name} />;
              if (id === 'manufacturers') return <ManufacturersSection productId={product.id} />;
              if (id === 'research') return <ResearchSection scope={product.id} />;
              if (id === 'listing') return <ListingSection productId={product.id} productName={product.name} />;
              if (id === 'design_druck') return <DesignDruckSection productId={product.id} />;
              return <ChecklistSection productId={product.id} />;
            },
          }))}
          onReorder={moveSection}
        />
      </div>
      <div className="mt-4">
        <AutosaveIndicator />
      </div>
    </PageWrapper>
  );
}

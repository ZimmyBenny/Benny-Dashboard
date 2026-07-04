/**
 * FolderDocumentsSection — Sektion „Dokumente" auf der Amazon-Produkt-Detailseite.
 *
 * Listet alle Dokumente-Ordner, die mit dem Produkt verknuepft sind (per
 * FolderRowMenu -> LinkProductModal in DocumentsPage). Klick auf eine Zeile
 * navigiert nach /amazon/dokumente und oeffnet den Ordner direkt dort
 * (Deep-Link via location.state.folderId, siehe DocumentsPage.tsx).
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchFoldersByProduct } from '../../api/documents.api';

interface FolderDocumentsSectionProps {
  productId: number;
}

export function FolderDocumentsSection({ productId }: FolderDocumentsSectionProps) {
  const navigate = useNavigate();
  const { data: folders = [], isLoading } = useQuery({
    queryKey: ['dokumente', 'by-product', productId],
    queryFn: () => fetchFoldersByProduct(productId),
  });

  return (
    <section
      className="rounded-xl"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <header className="flex items-center gap-3 px-5 py-4">
        <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>folder</span>
        <h2 className="flex-1 font-semibold" style={{ color: 'var(--color-primary)' }}>Dokumente</h2>
        <span
          className="text-xs tabular-nums px-2 py-0.5 rounded-full"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
        >
          {folders.length}
        </span>
      </header>
      <div className="p-4 pt-0 flex flex-col gap-1">
        {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
        {!isLoading && folders.length === 0 && (
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
            Noch keine Ordner verknüpft.
          </p>
        )}
        {folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            onClick={() => navigate('/amazon/dokumente', { state: { folderId: folder.id } })}
            className="flex items-center gap-2 px-2 py-2 rounded-md text-left hover:bg-white/[0.03]"
          >
            <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>folder</span>
            <span className="flex flex-col min-w-0">
              <span style={{ color: 'var(--color-on-surface)' }}>{folder.name}</span>
              {folder.path.length > 0 && (
                <span className="text-xs truncate" style={{ color: 'var(--color-on-surface-variant)' }}>
                  {folder.path.join(' / ')}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * FolderDocumentsSection — Sektion „Dokumente" auf der Amazon-Produkt-Detailseite.
 *
 * Listet alle Dokumente-Ordner, die mit dem Produkt verknuepft sind (per
 * FolderRowMenu -> LinkProductModal in DocumentsPage). Klick auf eine Zeile
 * navigiert nach /amazon/dokumente und oeffnet den Ordner direkt dort
 * (Deep-Link via location.state.folderId, siehe DocumentsPage.tsx).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fetchFoldersByProduct } from '../../api/documents.api';
import { SectionHeader } from './SectionHeader';

interface FolderDocumentsSectionProps {
  productId: number;
}

const STORAGE_KEY = (productId: number) => `amazon.documents.expanded.${productId}`;

export function FolderDocumentsSection({ productId }: FolderDocumentsSectionProps) {
  const navigate = useNavigate();
  const { data: folders = [], isLoading } = useQuery({
    queryKey: ['dokumente', 'by-product', productId],
    queryFn: () => fetchFoldersByProduct(productId),
  });

  // Standardmaessig zugeklappt — sonst blaeht die Ordnerstruktur die Seite auf (User-Wunsch 2026-07-06).
  const [expanded, setExpanded] = useState<boolean>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY(productId)) : null;
    return v === '1';
  });

  function toggle() {
    setExpanded(prev => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY(productId), next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  return (
    <section
      className="rounded-xl"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader
        icon="folder"
        title="Dokumente"
        accent="var(--color-primary)"
        expanded={expanded}
        onToggleExpand={toggle}
        rightSlot={
          <span
            className="text-xs tabular-nums px-2 py-0.5 rounded-full"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}
          >
            {folders.length}
          </span>
        }
      />
      {expanded && (
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
      )}
    </section>
  );
}

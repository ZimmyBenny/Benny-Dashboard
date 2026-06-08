import { useState } from 'react';
import { getUspVersionPdfObjectUrl, type UspVersion } from '../../../api/amazon.api';
import { useUspVersions, useDeleteUspVersion } from '../../../hooks/amazon/useUsp';
import { DeleteUspVersionDialog } from './DeleteUspVersionDialog';

function fmt(ts: number): string {
  return new Date(ts * 1000).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

export function UspVersions({ productId }: { productId: number }) {
  const { data: versions = [], isLoading } = useUspVersions(productId);
  const del = useDeleteUspVersion(productId);
  const [pendingDelete, setPendingDelete] = useState<UspVersion | null>(null);

  async function open(v: UspVersion) {
    const url = await getUspVersionPdfObjectUrl(productId, v.id);
    window.open(url, '_blank');
  }
  async function download(v: UspVersion) {
    const url = await getUspVersionPdfObjectUrl(productId, v.id);
    const a = document.createElement('a');
    a.href = url; a.download = `Produktanfrage_${v.manufacturer_name || 'Hersteller'}.pdf`;
    a.click();
  }

  return (
    <div className="mt-4">
      <span className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>Versionen</span>
      {isLoading && <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
      {!isLoading && versions.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Noch keine Versionen gespeichert.</p>
      )}
      <div className="flex flex-col gap-1">
        {versions.map(v => (
          <div key={v.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
            style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: 'var(--color-on-surface)', minWidth: 160 }}>{v.manufacturer_name || 'Hersteller'}</span>
            <span style={{ color: 'var(--color-on-surface-variant)' }}>{fmt(v.created_at)}</span>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => open(v)} className="px-2 py-1 rounded-md text-xs flex items-center gap-1"
                style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span>Ansehen
              </button>
              <button type="button" onClick={() => download(v)} className="px-2 py-1 rounded-md text-xs flex items-center gap-1"
                style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>Herunterladen
              </button>
              <button type="button" onClick={() => setPendingDelete(v)} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Version löschen">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>
      {pendingDelete && (
        <DeleteUspVersionDialog
          label={`${pendingDelete.manufacturer_name || 'Hersteller'} · ${fmt(pendingDelete.created_at)}`}
          onConfirm={() => del.mutate(pendingDelete.id)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

import { type SourcingSample } from '../../api/amazon.api';
import { useDeleteSample } from '../../hooks/amazon/useSourcing';

interface Props {
  productId: number;
  sample: SourcingSample | null;
  onClose: () => void;
}

export function DeleteSampleDialog({ productId, sample, onClose }: Props) {
  const del = useDeleteSample(productId);
  if (!sample) return null;

  async function handleConfirm() {
    if (!sample) return;
    try {
      await del.mutateAsync(sample.id);
      onClose();
    } catch { /* Fehler bleibt im Mutation-State */ }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-[400px] max-w-[90vw] rounded-xl p-5"
        style={{ background: 'var(--color-surface-container)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>Sample loeschen?</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
          „{sample.hersteller || 'Unbenanntes Sample'}" wird dauerhaft entfernt.
        </p>
        {del.isError && <p className="text-sm mb-2" style={{ color: '#fca5a5' }}>Loeschen fehlgeschlagen.</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={del.isPending}
            className="px-4 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={del.isPending}
            className="px-4 py-2 rounded-md text-sm"
            style={{ background: '#dc2626', color: '#fff' }}
          >
            {del.isPending ? 'Loesche…' : 'Loeschen'}
          </button>
        </div>
      </div>
    </div>
  );
}

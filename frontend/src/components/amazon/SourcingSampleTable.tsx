import { useState } from 'react';
import { type SourcingSample } from '../../api/amazon.api';
import { useCreateSample } from '../../hooks/amazon/useSourcing';
import { SourcingSampleRow } from './SourcingSampleRow';
import { DeleteSampleDialog } from './DeleteSampleDialog';

const SAMPLE_LIMIT = 50;

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--color-on-surface-variant)',
  padding: '8px',
  whiteSpace: 'nowrap',
};

interface Props {
  productId: number;
  samples: SourcingSample[];
}

export function SourcingSampleTable({ productId, samples }: Props) {
  const create = useCreateSample(productId);
  const [pendingDelete, setPendingDelete] = useState<SourcingSample | null>(null);
  const atLimit = samples.length >= SAMPLE_LIMIT;

  return (
    <div className="px-5 pb-5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
        <span className="material-symbols-outlined text-base">bar_chart</span>
        Sample Vergleich
      </h3>

      {samples.length === 0 ? (
        <p
          className="text-sm text-center py-6 rounded-md"
          style={{ color: 'var(--color-on-surface-variant)', background: 'var(--color-surface-container-low)' }}
        >
          Noch keine Samples — auf „+ Sample hinzufuegen" klicken.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '900px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Winner</th>
                <th style={TH_STYLE}>Hersteller</th>
                <th style={TH_STYLE}>Sample Kosten</th>
                <th style={TH_STYLE}>Besonderheiten</th>
                <th style={TH_STYLE}>Lieferzeit</th>
                <th style={TH_STYLE}>Qualitaet</th>
                <th style={TH_STYLE}>Bewertung</th>
                <th style={TH_STYLE}>Status</th>
                <th style={TH_STYLE}>Notizen</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {samples.map(s => (
                <SourcingSampleRow
                  key={s.id}
                  productId={productId}
                  sample={s}
                  onRequestDelete={setPendingDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending || atLimit}
          title={atLimit ? `Maximal ${SAMPLE_LIMIT} Samples pro Produkt` : undefined}
          className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
          style={{
            background: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Sample hinzufuegen
        </button>
      </div>

      <DeleteSampleDialog
        productId={productId}
        sample={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

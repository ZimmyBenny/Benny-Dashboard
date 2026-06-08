import { useState } from 'react';
import { type UspPoint } from '../../../api/amazon.api';
import { useUsp, useCreateUspPoint, useDeleteUspPoint, useUpdateUspManufacturer } from '../../../hooks/amazon/useUsp';
import { SectionHeader } from '../SectionHeader';
import { UspMetaForm } from './UspMetaForm';
import { UspPointList } from './UspPointList';
import { UspManufacturers } from './UspManufacturers';
import { UspMatrix } from './UspMatrix';
import { UspOverview } from './UspOverview';
import { DeleteUspPointDialog } from './DeleteUspPointDialog';
import { exportUspPdf } from '../../../lib/amazon/exportUspPdf';

const ACCENT = '#60a5fa';

function expandKey(p: number) {
  return `amazon.usp.expanded.${p}`;
}

function readExpanded(p: number): boolean {
  try {
    const v = localStorage.getItem(expandKey(p));
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

interface Props {
  productId: number;
  productName: string;
}

export function UspSection({ productId, productName }: Props) {
  const { data, isLoading, isError, refetch } = useUsp(productId);
  const createPoint = useCreateUspPoint(productId);
  const deletePoint = useDeleteUspPoint(productId);
  const updateManufacturer = useUpdateUspManufacturer(productId);
  const [expanded, setExpanded] = useState(() => readExpanded(productId));
  const [pendingDelete, setPendingDelete] = useState<UspPoint | null>(null);
  const [exportMId, setExportMId] = useState<number | null>(null);

  function toggle() {
    setExpanded(prev => {
      const next = !prev;
      try {
        localStorage.setItem(expandKey(productId), next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function handleExport() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    await new Promise(r => setTimeout(r, 350));
    const fresh = await refetch();
    if (!fresh.data) return;
    const m = fresh.data.manufacturers.find(x => x.id === exportMId) ?? fresh.data.manufacturers[0];
    if (!m) return;
    await exportUspPdf(productId, productName, fresh.data.meta, fresh.data.points, m);
    // Hersteller als 'gesendet' markieren (Anfrage wurde exportiert/verschickt)
    if (!m.gesendet) updateManufacturer.mutate({ mId: m.id, patch: { gesendet: 1 } });
  }

  return (
    <section
      className="rounded-xl"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader
        icon="lightbulb"
        title="USP"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={toggle}
      />
      {expanded && (
        <div className="p-4 pt-0">
          {isLoading && (
            <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade USP …</p>
          )}
          {isError && (
            <div className="flex items-center gap-2">
              <p style={{ color: 'var(--color-on-surface)' }}>USP konnte nicht geladen werden.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="px-3 py-1.5 rounded-md text-sm"
                style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
              >
                Erneut laden
              </button>
            </div>
          )}
          {data && (
            <>
              <UspMetaForm productId={productId} meta={data.meta} />
              <UspPointList
                productId={productId}
                points={data.points}
                onRequestDelete={setPendingDelete}
              />
              <div className="mt-2 mb-4">
                <button
                  type="button"
                  onClick={() => createPoint.mutate(undefined)}
                  className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{
                    background: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                  Punkt
                </button>
              </div>
              <UspManufacturers productId={productId} manufacturers={data.manufacturers} />
              <UspMatrix
                productId={productId}
                points={data.points}
                manufacturers={data.manufacturers}
                feasibility={data.feasibility}
              />
              <UspOverview
                points={data.points}
                manufacturers={data.manufacturers}
                feasibility={data.feasibility}
              />
              <div className="flex items-center gap-2">
                <select
                  value={exportMId ?? (data.manufacturers[0]?.id ?? '')}
                  onChange={(e) => setExportMId(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-md text-sm"
                  style={{
                    background: 'var(--color-surface-container-high)',
                    color: 'var(--color-on-surface)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {data.manufacturers.map(m => (
                    <option key={m.id} value={m.id}>{m.name || 'Hersteller'}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleExport}
                  className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{ background: ACCENT, color: '#08131f' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>
                  PDF exportieren
                </button>
              </div>
            </>
          )}
          {pendingDelete && (
            <DeleteUspPointDialog
              pointTitle={pendingDelete.title}
              onConfirm={() => deletePoint.mutate(pendingDelete.id)}
              onClose={() => setPendingDelete(null)}
            />
          )}
        </div>
      )}
    </section>
  );
}

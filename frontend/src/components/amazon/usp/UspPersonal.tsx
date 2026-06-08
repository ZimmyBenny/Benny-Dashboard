import { useState } from 'react';
import { type UspPayload } from '../../../api/amazon.api';
import { UspBeispiele } from './UspBeispiele';
import { UspKaufgruende } from './UspKaufgruende';
import { UspFiles } from './UspFiles';

function expandKey(p: number) { return `amazon.usp.personal.${p}`; }
function readExpanded(p: number): boolean { try { return localStorage.getItem(expandKey(p)) === '1'; } catch { return false; } }

export function UspPersonal({ productId, data }: { productId: number; data: UspPayload }) {
  const [expanded, setExpanded] = useState(() => readExpanded(productId));
  function toggle() {
    setExpanded(prev => { const next = !prev; try { localStorage.setItem(expandKey(productId), next ? '1' : '0'); } catch { /* ignore */ } return next; });
  }
  return (
    <div className="mt-5 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'var(--color-surface-container-low)' }}>
      <button type="button" onClick={toggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-surface-variant)' }}>{expanded ? 'expand_more' : 'chevron_right'}</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>Persönlich</span>
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>nur für dich · nicht im PDF</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-5">
          <UspBeispiele productId={productId} meta={data.meta} />
          <UspKaufgruende productId={productId} kaufgruende={data.kaufgruende} />
          <UspFiles productId={productId} files={data.files} />
        </div>
      )}
    </div>
  );
}

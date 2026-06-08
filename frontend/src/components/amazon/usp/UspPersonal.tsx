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
    <div className="mt-6 rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.14)', borderLeft: '4px solid #fbbf24', background: 'var(--color-surface-container)', boxShadow: '0 1px 6px rgba(0,0,0,0.3)' }}>
      <button type="button" onClick={toggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fbbf24' }}>workspace_premium</span>
        <span className="text-lg font-bold" style={{ color: 'var(--color-on-surface)', fontFamily: 'var(--font-headline)' }}>Persönlich</span>
        <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>nur für dich · nicht im PDF</span>
        <span className="material-symbols-outlined ml-auto" style={{ fontSize: 24, color: 'var(--color-on-surface-variant)' }}>{expanded ? 'expand_less' : 'expand_more'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-6">
          <UspBeispiele productId={productId} meta={data.meta} />
          <UspKaufgruende productId={productId} kaufgruende={data.kaufgruende} />
          <UspFiles productId={productId} files={data.files} />
        </div>
      )}
    </div>
  );
}

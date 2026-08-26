import { useState } from 'react';
import { SectionHeader } from '../SectionHeader';
import { useKeywords } from '../../../hooks/amazon/useKeywords';
import { KeywordSourcesTable } from './KeywordSourcesTable';
import { KeywordPoolTable } from './KeywordPoolTable';
import { ClaudePromptModal } from './ClaudePromptModal';
import { KEYWORDS_ACCENT } from './targetFields';

const STORAGE_KEY = (productId: number) => `amazon.keywords.expanded.${productId}`;

export function KeywordsSection({ productId, productName }: { productId: number; productName: string }) {
  const { data } = useKeywords(productId);
  const count = data?.length ?? 0;
  const mainCount = (data ?? []).filter(k => k.is_main).length;

  const [expanded, setExpanded] = useState<boolean>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY(productId)) : null;
    return v === null ? true : v === '1';
  });
  function toggle() {
    setExpanded(prev => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY(productId), next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  const [promptOpen, setPromptOpen] = useState(false);

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader
        icon="manage_search"
        title="Keyword-Recherche"
        accent={KEYWORDS_ACCENT}
        expanded={expanded}
        onToggleExpand={toggle}
        rightSlot={
          <div className="flex items-center gap-2">
            <button
              type="button"
              title="Fertigen Claude-Prompt aus Produkt- und Mitbewerber-Daten erzeugen"
              onClick={(e) => { e.stopPropagation(); setPromptOpen(true); }}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
              style={{ background: `${KEYWORDS_ACCENT}22`, color: KEYWORDS_ACCENT, border: `1px solid ${KEYWORDS_ACCENT}55` }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>auto_awesome</span>
              Claude-Prompt
            </button>
            {mainCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>{mainCount} ★</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${KEYWORDS_ACCENT}22`, color: KEYWORDS_ACCENT }}>{count}</span>
          </div>
        }
      />
      {expanded && (
        <div className="px-3 pb-4">
          <KeywordSourcesTable productId={productId} />
          <KeywordPoolTable productId={productId} />
        </div>
      )}
      <ClaudePromptModal open={promptOpen} onClose={() => setPromptOpen(false)} productId={productId} productName={productName} />
    </section>
  );
}

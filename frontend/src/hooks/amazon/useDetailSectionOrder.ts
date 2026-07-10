import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'amazon.detail.section-order';
const DEFAULT_ORDER = ['sourcing', 'checklist', 'usp', 'manufacturers', 'research', 'listing', 'design_druck', 'packaging'] as const;
export type DetailSectionId = typeof DEFAULT_ORDER[number];

function readOrder(): DetailSectionId[] {
  if (typeof window === 'undefined') return [...DEFAULT_ORDER];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [...DEFAULT_ORDER];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [...DEFAULT_ORDER];
    const valid = parsed.filter(
      (x): x is DetailSectionId =>
        typeof x === 'string' && (DEFAULT_ORDER as readonly string[]).includes(x),
    );
    const seen = new Set(valid);
    const missing = DEFAULT_ORDER.filter(x => !seen.has(x));
    return [...valid, ...missing];
  } catch {
    return [...DEFAULT_ORDER];
  }
}

export function useDetailSectionOrder() {
  const [order, setOrder] = useState<DetailSectionId[]>(readOrder);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch {
      /* ignore */
    }
  }, [order]);

  const move = useCallback((fromId: DetailSectionId, toId: DetailSectionId) => {
    setOrder(prev => {
      if (fromId === toId) return prev;
      const next = [...prev];
      const fromIdx = next.indexOf(fromId);
      const toIdx = next.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromId);
      return next;
    });
  }, []);

  return { order, move };
}

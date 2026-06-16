import { useCallback, useState } from 'react';

/**
 * Merkt sich den Auf-/Zugeklappt-Zustand einer Detailseiten-Sektion pro Produkt
 * in localStorage (gleiches Muster wie USP/Checkliste). Beim nächsten Öffnen
 * wird der letzte Stand wiederhergestellt.
 *
 * @param productId   Produkt-ID
 * @param sectionKey  eindeutiger Schlüssel der Sektion (z.B. 'manufacturers', 'research')
 * @param defaultOpen Start-Zustand, wenn noch nichts gespeichert ist
 */
export function useSectionExpanded(productId: number, sectionKey: string, defaultOpen: boolean) {
  const storageKey = `amazon.${sectionKey}.expanded.${productId}`;
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  const toggle = useCallback(() => {
    setExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, [storageKey]);
  return { expanded, toggle };
}

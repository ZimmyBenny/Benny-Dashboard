import { useEffect, useMemo, useState } from 'react';
import { useDraggableModal } from '../../../hooks/useDraggableModal';
import { useKeywords } from '../../../hooks/amazon/useKeywords';
import { useListing } from '../../../hooks/amazon/useListing';
import type { Keyword, KeywordTargetField } from '../../../api/amazon.keywords.api';
import { KEYWORDS_ACCENT } from './targetFields';

interface Props { open: boolean; onClose: () => void; productId: number; productName: string }

const BULLET_FIELDS: KeywordTargetField[] = ['bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5'];

// Baut aus den zugewiesenen Keywords einen Prompt, mit dem Claude Titel + Bullets + Backend schreibt.
export function ListingPromptModal({ open, onClose, productId, productName }: Props) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const keywords = useKeywords(productId);
  const listing = useListing(productId);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  useEffect(() => { if (open) setCopied(false); }, [open]);

  const prompt = useMemo(() => {
    const kws = keywords.data ?? [];
    const byField = (tf: KeywordTargetField) => kws.filter(k => k.target_field === tf)
      .sort((a, b) => (b.search_volume ?? 0) - (a.search_volume ?? 0));
    const fmt = (k: Keyword) => k.search_volume != null ? `${k.phrase} (${k.search_volume})` : k.phrase;
    const category = listing.data?.listing.category?.trim();

    const title = byField('title');
    const backend = byField('backend');

    const lines: string[] = [];
    lines.push(`Schreibe ein optimiertes Amazon-Listing (deutsch) für mein Produkt „${productName}".`);
    if (category) lines.push(`Kategorie: ${category}`);
    lines.push('');
    lines.push('Zugewiesene Keywords (Zahl = monatliches Suchvolumen):');
    lines.push(`TITEL-Keywords: ${title.length ? title.map(fmt).join(', ') : '—'}`);
    BULLET_FIELDS.forEach((bf, i) => {
      const items = byField(bf);
      if (items.length) lines.push(`BULLET ${i + 1}-Keywords: ${items.map(fmt).join(', ')}`);
    });
    lines.push(`BACKEND-Keywords: ${backend.length ? backend.map(k => k.phrase).join(', ') : '—'}`);
    lines.push('');
    lines.push('Aufgabe:');
    lines.push('1) TITEL: ein verkaufsstarker, natürlich lesbarer Titel; die Titel-Keywords einarbeiten; kurz und prägnant (neue Amazon-Titel sind kürzer, ~150–200 Zeichen), keine Keyword-Aneinanderreihung.');
    lines.push('2) 5 BULLET POINTS: je nutzenorientiert; die jeweiligen Bullet-Keywords natürlich einweben; kurze, prägnante Phrasen statt ganzer Sätze; echte Umlaute.');
    lines.push('3) BACKEND-SEARCH-TERMS: eine Zeile, leerzeichen-getrennt, höchstens 249 Bytes; nutze die Backend-Keywords plus Synonyme/Long-Tail/Schreibvarianten; KEINE Wörter wiederholen, die schon im Titel oder in den Bullets stehen.');
    lines.push('');
    lines.push('Gib das Ergebnis klar gelabelt zurück: „Titel:", „Bullet 1:" … „Bullet 5:", „Backend:".');
    return lines.join('\n');
  }, [keywords.data, listing.data, productName]);

  async function copy() {
    try { await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div data-draggable-modal className="w-[640px] max-w-[92vw] rounded-xl" style={{ background: 'var(--color-surface-container)', ...modalStyle }} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b" style={{ ...headerStyle, borderColor: 'rgba(255,255,255,0.08)' }} onMouseDown={onMouseDown}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ color: KEYWORDS_ACCENT }}>edit_note</span>
            Listing-Prompt für Claude
          </h2>
          <button type="button" onClick={onClose} aria-label="Schließen"><span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)' }}>close</span></button>
        </header>
        <div className="p-4 space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Text kopieren, im Claude-Chat einfügen. Claude liefert Titel + 5 Bullets + Backend-Search-Terms, die du ins Listing überträgst.
          </p>
          <textarea readOnly value={prompt} rows={16}
            className="w-full rounded-lg px-3 py-2 text-sm resize-y"
            style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', fontFamily: 'inherit', lineHeight: '1.5' }}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Schließen</button>
            <button type="button" onClick={copy} className="px-4 py-2 rounded-md text-sm flex items-center gap-1.5" style={{ background: KEYWORDS_ACCENT, color: '#06231f' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>{copied ? 'check' : 'content_copy'}</span>
              {copied ? 'Kopiert' : 'Prompt kopieren'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

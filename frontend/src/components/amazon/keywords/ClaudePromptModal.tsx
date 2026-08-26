import { useEffect, useMemo, useState } from 'react';
import { useDraggableModal } from '../../../hooks/useDraggableModal';
import { useCompetitors } from '../../../hooks/amazon/useCompetitors';
import { useListing } from '../../../hooks/amazon/useListing';
import { useKeywords, useKeywordSources } from '../../../hooks/amazon/useKeywords';
import { KEYWORDS_ACCENT } from './targetFields';

interface Props {
  open: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
}

// Baut aus vorhandenen Produkt-/Mitbewerber-Daten einen fertigen Prompt für den Chat.
export function ClaudePromptModal({ open, onClose, productId, productName }: Props) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const competitors = useCompetitors(productId);
  const listing = useListing(productId);
  const keywords = useKeywords(productId);
  const sources = useKeywordSources(productId);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => { if (open) setCopied(false); }, [open]);

  const prompt = useMemo(() => {
    const category = listing.data?.listing.category?.trim();
    const comps = (competitors.data ?? [])
      .map(c => [c.title?.trim(), c.subtitle?.trim(), c.asin?.trim()].filter(Boolean).join(' — '))
      .filter(Boolean);
    const existing = (keywords.data ?? []).map(k => k.phrase);

    // ASINs aus den Mitbewerber-Karten (zum Entdoppeln der Quellen-Liste).
    const compAsins = new Set(
      (competitors.data ?? []).map(c => c.asin?.trim().toLowerCase()).filter(Boolean),
    );
    // Quellen (Keyword-Recherche): ASIN + Link, ohne Dubletten zu den Mitbewerbern.
    const srcLines = (sources.data ?? [])
      .filter(s => s.asin?.trim() || s.url?.trim())
      .filter(s => !compAsins.has(s.asin?.trim().toLowerCase()))
      .map(s => [s.asin?.trim(), s.url?.trim()].filter(Boolean).join(' — '));

    const lines: string[] = [];
    lines.push(`Ich mache Amazon-Keyword-Recherche für mein Produkt „${productName}".`);
    if (category) lines.push(`Kategorie: ${category}`);
    lines.push('');
    if (comps.length > 0) {
      lines.push('Mitbewerber (Titel / Untertitel / ASIN):');
      comps.forEach(c => lines.push(`- ${c}`));
      lines.push('');
    }
    if (srcLines.length > 0) {
      lines.push('Weitere Konkurrenz-Quellen (ASIN / Link):');
      srcLines.forEach(s => lines.push(`- ${s}`));
      lines.push('');
    }
    if (existing.length > 0) {
      lines.push('Diese Keywords habe ich bereits (bitte NICHT wiederholen):');
      lines.push(existing.join(', '));
      lines.push('');
    }
    lines.push('Aufgabe: Erzeuge relevante deutsche Amazon-Suchbegriffe für dieses Produkt.');
    lines.push('Clustere nach Themen, markiere die stärksten, keine Dubletten zu den bestehenden.');
    lines.push('Gib das Ergebnis am Ende als einfache Liste zurück — ein Keyword pro Zeile, ohne Nummerierung —, damit ich sie direkt in mein System einfügen kann.');
    return lines.join('\n');
  }, [listing.data, competitors.data, keywords.data, sources.data, productName]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* Clipboard nicht verfügbar */ }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        data-draggable-modal
        className="w-[620px] max-w-[92vw] rounded-xl"
        style={{ background: 'var(--color-surface-container)', ...modalStyle }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ ...headerStyle, borderColor: 'rgba(255,255,255,0.08)' }}
          onMouseDown={onMouseDown}
        >
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ color: KEYWORDS_ACCENT }}>auto_awesome</span>
            Claude-Prompt für Keyword-Recherche
          </h2>
          <button type="button" onClick={onClose} aria-label="Schließen">
            <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)' }}>close</span>
          </button>
        </header>

        <div className="p-4 space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
            Diesen Text kopieren und im Claude-Chat einfügen. Die zurückgegebene Liste (ein Keyword pro Zeile)
            fügst du unten im Keyword-Pool über „Mehrere einfügen" wieder ein.
          </p>
          <textarea
            readOnly
            value={prompt}
            rows={14}
            className="w-full rounded-lg px-3 py-2 text-sm resize-y"
            style={{
              background: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontFamily: 'inherit', lineHeight: '1.5',
            }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
            >
              Schließen
            </button>
            <button
              type="button"
              onClick={copy}
              className="px-4 py-2 rounded-md text-sm flex items-center gap-1.5"
              style={{ background: KEYWORDS_ACCENT, color: '#06231f' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '17px' }}>{copied ? 'check' : 'content_copy'}</span>
              {copied ? 'Kopiert' : 'Prompt kopieren'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

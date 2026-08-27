import { useEffect, useMemo, useState } from 'react';
import { useDraggableModal } from '../../../hooks/useDraggableModal';
import { useKeywords, useKeywordImportFile } from '../../../hooks/amazon/useKeywords';
import { useListing } from '../../../hooks/amazon/useListing';
import { useBrand } from '../../../hooks/amazon/useBrand';
import { getKeywordImportFileObjectUrl, type Keyword, type KeywordTargetField } from '../../../api/amazon.keywords.api';
import { KEYWORDS_ACCENT } from './targetFields';

interface Props { open: boolean; onClose: () => void; productId: number; productName: string }

const BULLET_FIELDS: KeywordTargetField[] = ['bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5'];
const FACTS_KEY = (productId: number) => `amazon.keywords.listingFacts.${productId}`;

// Baut aus den zugewiesenen Keywords einen Prompt, mit dem Claude Titel + Bullets + Backend schreibt.
export function ListingPromptModal({ open, onClose, productId, productName }: Props) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const keywords = useKeywords(productId);
  const listing = useListing(productId);
  const importFile = useKeywordImportFile(productId);
  const brand = useBrand(productId);
  const [copied, setCopied] = useState(false);

  // Marke = finaler (sonst favorisierter) Namens-Kandidat aus dem Markenname-Modul.
  const brandName = useMemo(() => {
    const names = brand.data?.names ?? [];
    return (names.find(n => n.is_final) ?? names.find(n => n.is_favorite))?.name?.trim() ?? '';
  }, [brand.data]);

  // Produkt-Fakten (Größe/Material/Merkmale) — pro Produkt gemerkt.
  const [facts, setFacts] = useState('');
  useEffect(() => {
    if (!open) return;
    try { setFacts(window.localStorage.getItem(FACTS_KEY(productId)) ?? ''); } catch { setFacts(''); }
  }, [open, productId]);
  function updateFacts(v: string) {
    setFacts(v);
    try { window.localStorage.setItem(FACTS_KEY(productId), v); } catch { /* ignore */ }
  }

  async function downloadImportFile() {
    try {
      const url = await getKeywordImportFileObjectUrl(productId);
      const a = document.createElement('a');
      a.href = url;
      a.download = importFile.data?.original_name || 'helium10-import';
      document.body.appendChild(a); a.click(); a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { /* Datei evtl. weg */ }
  }

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
    if (brandName) lines.push(`Marke: ${brandName} (der Titel MUSS mit der Marke beginnen).`);
    if (category) lines.push(`Kategorie: ${category}`);
    if (facts.trim()) {
      lines.push('');
      lines.push('Produkt-Fakten (verbindlich — verwende NUR diese Angaben zu Größe/Material/Merkmalen):');
      lines.push(facts.trim());
    }
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
    lines.push(`1) TITEL: ein verkaufsstarker, natürlich lesbarer Titel${brandName ? ', beginnend mit der Marke' : ''}; die Titel-Keywords einarbeiten; kurz und prägnant (neue Amazon-Titel sind kürzer, ~150–200 Zeichen), keine Keyword-Aneinanderreihung.`);
    lines.push('2) 5 BULLET POINTS: je nutzenorientiert; die jeweiligen Bullet-Keywords natürlich einweben; kurze, prägnante Phrasen statt ganzer Sätze; echte Umlaute.');
    lines.push('3) BACKEND-SEARCH-TERMS: eine Zeile, leerzeichen-getrennt, höchstens 249 Bytes; nutze die Backend-Keywords plus Synonyme/Long-Tail/Schreibvarianten; KEINE Wörter wiederholen, die schon im Titel oder in den Bullets stehen.');
    lines.push('');
    lines.push('WICHTIG: Erfinde keine Größen, Maße oder Eigenschaften, die nicht in den Produkt-Fakten stehen. Ignoriere Keyword-Größen, die nicht zum Produkt passen (nutze solche höchstens im Backend).');
    lines.push('');
    lines.push('Gib das Ergebnis klar gelabelt zurück: „Titel:", „Bullet 1:" … „Bullet 5:", „Backend:".');
    return lines.join('\n');
  }, [keywords.data, listing.data, productName, brandName, facts]);

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
          {importFile.data && (
            <div className="rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap" style={{ background: `${KEYWORDS_ACCENT}12`, border: `1px solid ${KEYWORDS_ACCENT}44` }}>
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: KEYWORDS_ACCENT }}>attach_file</span>
              <span className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--color-on-surface)' }}>
                Import-Datei: {importFile.data.original_name}
              </span>
              <button type="button" onClick={downloadImportFile} className="text-xs px-2 py-1 rounded-md flex items-center gap-1"
                style={{ background: `${KEYWORDS_ACCENT}22`, color: KEYWORDS_ACCENT, border: `1px solid ${KEYWORDS_ACCENT}55` }}>
                <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>download</span>Herunterladen
              </button>
              <span className="text-xs w-full" style={{ color: 'var(--color-on-surface-variant)' }}>
                Diese Datei zusätzlich in den Claude-Chat ziehen — dann sieht Claude alle Zahlen.
              </span>
            </div>
          )}
          {/* Produkt-Fakten (verbindlich für Größe/Material/Merkmale) */}
          <div>
            <label className="text-sm flex items-center gap-2 mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>
              Produkt-Fakten (Größe, Material, Merkmale)
              {brandName && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${KEYWORDS_ACCENT}22`, color: KEYWORDS_ACCENT }}>Marke: {brandName}</span>}
            </label>
            <textarea
              value={facts} onChange={(e) => updateFacts(e.target.value)} rows={3}
              placeholder="z. B. Größe: 180×200 cm · Material: atmungsaktives Netz · ohne Bohren montierbar · für Boxspringbett"
              spellCheck={false}
              className="w-full rounded-lg px-3 py-2 text-sm resize-y"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', lineHeight: '1.5' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
              Claude nutzt NUR diese Angaben für Maße/Merkmale — so kommen keine falschen Größen in den Titel. Wird gemerkt.
            </p>
          </div>

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

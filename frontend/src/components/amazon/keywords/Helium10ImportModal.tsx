import { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggableModal } from '../../../hooks/useDraggableModal';
import { useKeywords, useKeywordSources, useImportHelium10 } from '../../../hooks/amazon/useKeywords';
import { parseHelium10, type ParsedHelium10 } from '../../../lib/amazon/parseHelium10';
import { KEYWORDS_ACCENT } from './targetFields';

interface Props { open: boolean; onClose: () => void; productId: number }

export function Helium10ImportModal({ open, onClose, productId }: Props) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  const sources = useKeywordSources(productId);
  const keywords = useKeywords(productId);
  const doImport = useImportHelium10(productId);

  const [parsed, setParsed] = useState<ParsedHelium10 | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [minVolume, setMinVolume] = useState('200');
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<{ updated: number; added: number; linked: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Beim Öffnen/Schließen zurücksetzen.
  useEffect(() => { if (!open) { setParsed(null); setFileName(null); setResult(null); setBusy(false); } }, [open]);

  const knownAsins = useMemo(
    () => (sources.data ?? []).map(s => s.asin.trim()).filter(Boolean),
    [sources.data],
  );

  async function handleFile(file: File) {
    setResult(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      setParsed(parseHelium10(buf, knownAsins));
    } catch {
      setParsed({ type: 'magnet', rows: [], detectedAsins: [], matchedAsins: [], keywordHeader: null, volumeHeader: null, error: 'Datei konnte nicht gelesen werden.' });
    }
  }

  const minVol = Math.max(0, Math.trunc(Number(minVolume) || 0));

  // Live-Vorschau: aktualisiert (vorhanden) vs. neu (ab Schwelle) vs. verworfen.
  const preview = useMemo(() => {
    if (!parsed || parsed.error) return null;
    const existing = new Set((keywords.data ?? []).map(k => k.phrase.toLowerCase()));
    let updated = 0, added = 0, skipped = 0;
    for (const r of parsed.rows) {
      if (existing.has(r.phrase.toLowerCase())) updated++;
      else if ((r.search_volume ?? -1) >= minVol) added++;
      else skipped++;
    }
    return { updated, added, skipped, total: parsed.rows.length };
  }, [parsed, keywords.data, minVol]);

  async function confirmImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setBusy(true);
    try {
      const res = await doImport.mutateAsync({
        sourceLabel: parsed.type === 'cerebro' ? 'Cerebro' : 'Magnet',
        minVolume: minVol,
        rows: parsed.rows,
      });
      setResult({ updated: res.updated, added: res.added, linked: res.linked });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const inputStyle: React.CSSProperties = { background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div data-draggable-modal className="w-[600px] max-w-[92vw] rounded-xl" style={{ background: 'var(--color-surface-container)', ...modalStyle }} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-4 py-3 border-b" style={{ ...headerStyle, borderColor: 'rgba(255,255,255,0.08)' }} onMouseDown={onMouseDown}>
          <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ color: KEYWORDS_ACCENT }}>upload_file</span>
            Helium 10 importieren
          </h2>
          <button type="button" onClick={onClose} aria-label="Schließen"><span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)' }}>close</span></button>
        </header>

        <div className="p-4 space-y-4">
          {/* Ergebnis nach Import */}
          {result ? (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                Import abgeschlossen: <b>{result.updated}</b> aktualisiert, <b>{result.added}</b> neu, <b>{result.linked}</b> Keyword↔Konkurrent-Verknüpfungen.
              </p>
              <div className="flex justify-end">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ background: KEYWORDS_ACCENT, color: '#06231f' }}>Fertig</button>
              </div>
            </div>
          ) : (
            <>
              {/* Drop-Zone */}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                className="w-full rounded-lg px-4 py-6 flex flex-col items-center justify-center text-sm text-center"
                style={{ background: 'var(--color-surface-container-low)', border: `1px dashed ${dragOver ? KEYWORDS_ACCENT : 'rgba(255,255,255,0.16)'}`, color: 'var(--color-on-surface-variant)' }}
              >
                <span className="material-symbols-outlined mb-1" style={{ fontSize: '28px', color: dragOver ? KEYWORDS_ACCENT : 'var(--color-on-surface-variant)' }}>cloud_upload</span>
                {fileName ? <span style={{ color: 'var(--color-on-surface)' }}>{fileName}</span> : 'Cerebro- oder Magnet-Export hier ablegen — oder klicken (.xlsx / .csv)'}
              </button>
              <input ref={fileInput} type="file" accept=".xlsx,.csv,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

              {parsed?.error && <p className="text-sm" style={{ color: '#fca5a5' }}>{parsed.error}</p>}

              {parsed && !parsed.error && (
                <div className="space-y-3">
                  {/* Erkennung */}
                  <div className="rounded-lg px-3 py-2 text-xs space-y-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-on-surface-variant)' }}>
                    <div>Typ erkannt: <b style={{ color: KEYWORDS_ACCENT }}>{parsed.type === 'cerebro' ? 'Cerebro (mit Konkurrenz-Abdeckung)' : 'Magnet (nur Suchvolumen)'}</b></div>
                    <div>Spalten: Keyword „{parsed.keywordHeader}" · Suchvolumen „{parsed.volumeHeader ?? '—'}"</div>
                    {parsed.type === 'cerebro' && (
                      <div>ASINs erkannt: {parsed.detectedAsins.length} · davon deinen Quellen zugeordnet: <b>{parsed.matchedAsins.length}</b>
                        {parsed.detectedAsins.length > 0 && parsed.matchedAsins.length === 0 && <span style={{ color: '#fbbf24' }}> — keine passt zu deinen Quellen-ASINs</span>}
                      </div>
                    )}
                  </div>

                  {/* Schwelle + Live-Vorschau */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <label className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Mindest-Suchvolumen für neue Keywords</label>
                    <input type="text" inputMode="numeric" value={minVolume} onChange={(e) => setMinVolume(e.target.value.replace(/[^\d]/g, ''))} className="rounded px-2 py-1 text-sm w-24 text-right tabular-nums" style={inputStyle} />
                  </div>
                  {preview && (
                    <p className="text-sm" style={{ color: 'var(--color-on-surface)' }}>
                      <b>{preview.updated}</b> vorhandene aktualisiert · <b>{preview.added}</b> neu (ab ≥ {minVol}) · {preview.skipped} unter Schwelle verworfen <span style={{ color: 'var(--color-on-surface-variant)' }}>(von {preview.total} Keywords)</span>
                    </p>
                  )}

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
                    <button type="button" onClick={confirmImport} disabled={busy || parsed.rows.length === 0} className="px-4 py-2 rounded-md text-sm disabled:opacity-50" style={{ background: KEYWORDS_ACCENT, color: '#06231f' }}>
                      {busy ? 'Importiere…' : 'Importieren'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

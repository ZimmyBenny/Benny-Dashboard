import { useRef } from 'react';
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { toPng } from 'html-to-image';

// Beschrifteter, klappbarer Bereich auf einer Seite — mit eigenem "Gesendet am …"
// und eigenem PNG-/PDF-Export.
export function SectionBlockView({ node, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const title = (node.attrs.title as string) ?? '';
  const collapsed = !!node.attrs.collapsed;
  const sentAt = node.attrs.sentAt as number | null;
  const sentNote = node.attrs.sentNote as string | null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickImages() { fileInputRef.current?.click(); }
  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const base = typeof getPos === 'function' ? getPos() : undefined;
    const pos = typeof base === 'number' ? base + node.nodeSize - 1 : -1; // Ende des Bereich-Inhalts
    const store = (editor.storage as unknown as Record<string, unknown>).sectionBlock as { onAddImage?: (f: File[], p: number) => void } | undefined;
    if (store?.onAddImage && pos >= 0) store.onAddImage(files, pos);
  }

  function toggleSent() {
    if (sentAt) {
      if (!window.confirm('„Gesendet"-Markierung für diesen Bereich entfernen?')) return;
      updateAttributes({ sentAt: null, sentNote: null });
    } else {
      const note = window.prompt('Notiz zur gesendeten Version (optional), z.B. „v1 an Jing":', '');
      if (note === null) return;
      updateAttributes({ sentAt: Math.floor(Date.now() / 1000), sentNote: note.trim() || null });
    }
  }

  const fileBase = () => (title || 'bereich').replace(/[/\\:*?"<>|]/g, '').trim() || 'bereich';

  // Index dieses Bereichs unter allen Bereichen (für den PDF-Export).
  function sectionIndex(): number {
    let idx = -1, count = 0;
    const myPos = typeof getPos === 'function' ? getPos() : -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'sectionBlock') { if (pos === myPos) idx = count; count++; }
      return true;
    });
    return idx;
  }

  async function exportPng() {
    const el = wrapRef.current;
    if (!el) return;
    const content = el.querySelector('.wb-section-content') as HTMLElement | null;
    const prevDisplay = content?.style.display ?? '';
    if (content && collapsed) content.style.display = 'block'; // eingeklappt trotzdem vollständig exportieren
    el.setAttribute('data-exporting', '');
    const whiteBg = !!el.closest('[data-white-bg]');
    // Inline-Bilder als Data-URL einbetten (html-to-image rendert Blob-URLs nicht).
    const imgs = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
    const orig = imgs.map((i) => i.src);
    await Promise.all(imgs.map(async (im) => {
      if (/^(blob:|https?:|\/)/.test(im.src)) {
        try { const b = await (await fetch(im.src)).blob(); im.src = await new Promise<string>((r, j) => { const f = new FileReader(); f.onload = () => r(f.result as string); f.onerror = j; f.readAsDataURL(b); }); } catch { /* lassen */ }
      }
    }));
    try {
      const url = await toPng(el, { backgroundColor: whiteBg ? '#ffffff' : '#0f161e', pixelRatio: 2, style: { margin: '0' } });
      const a = document.createElement('a'); a.href = url; a.download = `${fileBase()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch { /* ignorieren */ }
    finally {
      imgs.forEach((im, i) => { im.src = orig[i]; });
      el.removeAttribute('data-exporting');
      if (content && collapsed) content.style.display = prevDisplay;
    }
  }

  function exportPdf() {
    const store = (editor.storage as unknown as Record<string, unknown>).sectionBlock as { onExportPdf?: (i: number, t: string) => void } | undefined;
    const handler = store?.onExportPdf ?? null;
    const idx = sectionIndex();
    if (handler && idx >= 0) handler(idx, fileBase());
    else window.alert('PDF-Export für Bereiche ist gerade nicht verfügbar.');
  }

  return (
    <NodeViewWrapper className="wb-section-block" data-collapsed={collapsed ? '' : undefined} ref={wrapRef}>
      <div className="wb-section-header" contentEditable={false}>
        <button type="button" className="wb-section-icon-btn" title={collapsed ? 'Aufklappen' : 'Zuklappen'} onClick={() => updateAttributes({ collapsed: !collapsed })}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.3rem' }}>{collapsed ? 'chevron_right' : 'expand_more'}</span>
        </button>
        <input
          className="wb-section-title-input"
          value={title}
          placeholder="Bereich benennen…"
          onChange={(e) => updateAttributes({ title: e.target.value })}
          onKeyDown={(e) => e.stopPropagation()}
        />
        {sentAt && (
          <span className="wb-section-sent" title={sentNote ?? undefined}>
            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>check_circle</span>
            Gesendet am {new Date(sentAt * 1000).toLocaleDateString('de-DE')}{sentNote ? ` — ${sentNote}` : ''}
          </span>
        )}
        <button type="button" className="wb-section-icon-btn wb-section-hide-export" title="Bild in diesen Bereich einfügen" onClick={pickImages}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>add_photo_alternate</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFilesPicked} />
        <button type="button" className="wb-section-icon-btn wb-section-hide-export" title="Diesen Bereich als PNG" onClick={exportPng}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>image</span>
        </button>
        <button type="button" className="wb-section-icon-btn wb-section-hide-export" title="Diesen Bereich als PDF" onClick={exportPdf}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>picture_as_pdf</span>
        </button>
        <button type="button" className="wb-section-icon-btn wb-section-hide-export" title={sentAt ? 'Gesendet-Markierung entfernen' : 'Als „an Herstellerin gesendet" markieren'} onClick={toggleSent} style={{ color: sentAt ? '#4ade80' : undefined }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>forward_to_inbox</span>
        </button>
        <button type="button" className="wb-section-icon-btn wb-section-hide-export" title="Bereich löschen" onClick={() => { if (window.confirm('Diesen Bereich mit Inhalt löschen?')) deleteNode(); }} style={{ color: '#f87171' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>delete</span>
        </button>
      </div>
      <NodeViewContent className="wb-section-content" />
    </NodeViewWrapper>
  );
}

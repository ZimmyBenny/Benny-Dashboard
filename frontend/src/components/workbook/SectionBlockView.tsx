import { useRef, useState } from 'react';
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react';
import { toPng } from 'html-to-image';
import { FloatingImage } from './FloatingImage';
import { getAttachmentDataUrl, type PageImage } from '../../api/workbook.api';

interface SecImg { id: string; attachmentId: number; x: number; y: number; w: number; h: number; rot: number }

// Beschrifteter, klappbarer Bereich — mit frei platzierbaren Bildern im Bereich,
// eigenem "Gesendet am …" und PNG-/PDF-Export.
export function SectionBlockView({ node, updateAttributes, deleteNode, editor, getPos }: NodeViewProps) {
  const title = (node.attrs.title as string) ?? '';
  const collapsed = !!node.attrs.collapsed;
  const sentAt = node.attrs.sentAt as number | null;
  const sentNote = node.attrs.sentNote as string | null;
  const images: SecImg[] = Array.isArray(node.attrs.images) ? (node.attrs.images as SecImg[]) : [];
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selImg, setSelImg] = useState<string | null>(null);

  function updateImg(id: string, patch: Partial<Pick<SecImg, 'x' | 'y' | 'w' | 'h' | 'rot'>>) {
    updateAttributes({ images: images.map((im) => (im.id === id ? { ...im, ...patch } : im)) });
  }
  function removeImg(id: string) {
    setSelImg(null);
    updateAttributes({ images: images.filter((im) => im.id !== id) });
  }

  function pickImages() { fileInputRef.current?.click(); }
  function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    const pos = typeof getPos === 'function' ? getPos() : undefined;
    const store = (editor.storage as unknown as Record<string, unknown>).sectionBlock as { addSectionImages?: (p: number, f: File[], x: number, y: number) => void } | undefined;
    if (store?.addSectionImages && typeof pos === 'number') store.addSectionImages(pos, files, 24, 24);
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

  function sectionIndex(): number {
    let idx = -1, count = 0;
    const myPos = typeof getPos === 'function' ? getPos() : -1;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name === 'sectionBlock') { if (pos === myPos) idx = count; count++; }
      return true;
    });
    return idx;
  }

  function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  function drawContain(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
    const ar = im.naturalWidth / im.naturalHeight || 1, boxAr = w / h;
    let dw: number, dh: number;
    if (ar > boxAr) { dw = w; dh = w / ar; } else { dh = h; dw = h * ar; }
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  // PNG-Export: Text/Struktur via html-to-image, Bilder per Canvas darüber (html-to-image
  // kann große Fotos nicht einbetten). Zoom wird für den Export neutralisiert.
  async function exportPng() {
    const el = wrapRef.current;
    if (!el) return;
    const content = el.querySelector('.wb-section-content') as HTMLElement | null;
    const prevDisplay = content?.style.display ?? '';
    if (content && collapsed) content.style.display = 'block';
    // Zoom-Vorfahr neutralisieren
    let zw: HTMLElement | null = el.parentElement;
    while (zw && !zw.style.zoom) zw = zw.parentElement;
    const prevZoom = zw?.style.zoom ?? '';
    if (zw) zw.style.zoom = '1';
    el.setAttribute('data-exporting', '');
    const whiteBg = !!el.closest('[data-white-bg]');
    const floatEls = Array.from(el.querySelectorAll('[data-floating-image]')) as HTMLElement[];
    const prevVis = floatEls.map((f) => f.style.visibility);
    floatEls.forEach((f) => { f.style.visibility = 'hidden'; });
    await new Promise((r) => setTimeout(r, 40));
    try {
      const ratio = 2;
      const cardRect = el.getBoundingClientRect();
      const W = Math.round(cardRect.width), H = Math.round(cardRect.height);
      const domUrl = await toPng(el, { backgroundColor: whiteBg ? '#ffffff' : '#0f161e', width: W, height: H, pixelRatio: ratio });
      const canvas = document.createElement('canvas'); canvas.width = W * ratio; canvas.height = H * ratio;
      const ctx = canvas.getContext('2d')!; ctx.scale(ratio, ratio);
      const dom = await loadImg(domUrl);
      ctx.drawImage(dom, 0, 0, W, H);
      // Bilder über dem Text zeichnen (Position relativ zum Content-Bereich)
      const contentRect = (content ?? el).getBoundingClientRect();
      const ox = contentRect.left - cardRect.left, oy = contentRect.top - cardRect.top;
      for (const im of images) {
        try {
          const bmp = await loadImg(await getAttachmentDataUrl(im.attachmentId));
          const cx = ox + im.x + im.w / 2, cy = oy + im.y + im.h / 2;
          ctx.save(); ctx.translate(cx, cy); ctx.rotate((im.rot || 0) * Math.PI / 180); ctx.translate(-cx, -cy);
          drawContain(ctx, bmp, ox + im.x, oy + im.y, im.w, im.h);
          ctx.restore();
        } catch { /* Bild überspringen */ }
      }
      const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = `${fileBase()}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch { /* ignorieren */ }
    finally {
      floatEls.forEach((f, i) => { f.style.visibility = prevVis[i]; });
      el.removeAttribute('data-exporting');
      if (zw) zw.style.zoom = prevZoom;
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

  const contentMinH = Math.max(90, ...images.map((im) => im.y + im.h + 16));

  return (
    <NodeViewWrapper className="wb-section-block" data-section-block="" data-collapsed={collapsed ? '' : undefined} ref={wrapRef}>
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
        <button type="button" className="wb-section-icon-btn" title="Bild in diesen Bereich einfügen" onClick={pickImages}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>add_photo_alternate</span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFilesPicked} />
        <button type="button" className="wb-section-icon-btn" title="Diesen Bereich als PNG" onClick={exportPng}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>image</span>
        </button>
        <button type="button" className="wb-section-icon-btn" title="Diesen Bereich als PDF" onClick={exportPdf}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>picture_as_pdf</span>
        </button>
        <button type="button" className="wb-section-icon-btn" title={sentAt ? 'Gesendet-Markierung entfernen' : 'Als „an Herstellerin gesendet" markieren'} onClick={toggleSent} style={{ color: sentAt ? '#4ade80' : undefined }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>forward_to_inbox</span>
        </button>
        <button type="button" className="wb-section-icon-btn" title="Bereich löschen" onClick={() => { if (window.confirm('Diesen Bereich mit Inhalt löschen?')) deleteNode(); }} style={{ color: '#f87171' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '1.25rem' }}>delete</span>
        </button>
      </div>

      <div className="wb-section-content" style={{ position: 'relative', minHeight: contentMinH }} onClick={() => setSelImg(null)}>
        <NodeViewContent />
        {images.length > 0 && (
          // Nicht-editierbare Overlay-Ebene: ProseMirror fängt sonst die Zeiger-Events ab.
          // pointerEvents:none lässt Klicks in Leerflächen zum Text durch; Bilder selbst sind aktiv.
          <div contentEditable={false} suppressContentEditableWarning style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {images.map((im) => {
              const asPage: PageImage = { id: 0, page_id: 0, attachment_id: im.attachmentId, x: im.x, y: im.y, width: im.w, height: im.h, z: 0, rotation: im.rot, created_at: 0 };
              return (
                <div key={im.id} className="wb-section-image" style={{ pointerEvents: 'auto' }} onDragStart={(e) => e.preventDefault()}>
                  <FloatingImage
                    image={asPage}
                    selected={selImg === im.id}
                    onSelect={() => setSelImg(im.id)}
                    onCommit={(patch) => {
                      const p: Partial<Pick<SecImg, 'x' | 'y' | 'w' | 'h' | 'rot'>> = {};
                      if (patch.x !== undefined) p.x = patch.x;
                      if (patch.y !== undefined) p.y = patch.y;
                      if (patch.width !== undefined) p.w = patch.width;
                      if (patch.height !== undefined) p.h = patch.height;
                      if (patch.rotation !== undefined) p.rot = patch.rotation;
                      updateImg(im.id, p);
                    }}
                    onDelete={() => removeImg(im.id)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

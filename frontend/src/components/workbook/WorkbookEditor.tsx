import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import {
  updatePage, togglePin, toggleArchive, toggleTemplate,
  fetchAttachments, uploadAttachment, deleteAttachment, getAttachmentDownloadUrl,
  updatePageContact, exportWorkbook,
  fetchPageImages, createPageImage, updatePageImage, deletePageImage,
  fetchAnnotations, createAnnotation, updateAnnotation, deleteAnnotation,
  getAttachmentDataUrl, setPageSent,
  type Page, type Attachment, type PageImage, type PageAnnotation, type AnnotationPatch,
} from '../../api/workbook.api';
import { FloatingImage } from './FloatingImage';
import { ArrowAnnotation, TextAnnotation, RectAnnotation, XAnnotation, DrawAnnotation, HBracketAnnotation } from './WorkbookAnnotations';
import { snapBounds, type Bounds, type Guide, type SnapOpts } from './alignGuides';
import { toPng } from 'html-to-image';
import { fetchContact } from '../../api/contacts.api';
import { ContactPicker } from './ContactPicker';
import type { SaveStatus } from '../../pages/WorkbookPage';
import { createTask, deleteTask } from '../../api/tasks.api';
import type { Task } from '../../api/tasks.api';
import { TaskSlideOver } from '../tasks/TaskSlideOver';
import { EmailCardExtension } from '../../lib/EmailCardExtension';
import { ImageAttachmentExtension } from '../../lib/ImageAttachmentExtension';
import { SectionBlockExtension } from '../../lib/SectionBlockExtension';
import { parseEml } from '../../lib/parseEml';

interface WorkbookEditorProps {
  page: Page;
  onSaveStatusChange: (s: SaveStatus) => void;
  saveStatus: SaveStatus;
  onPageUpdated: (p: Page) => void;
  sectionName?: string;
}

function statusText(s: SaveStatus): string {
  if (s === 'saving') return 'Wird gespeichert...';
  if (s === 'saved') return 'Gespeichert';
  if (s === 'error') return 'Fehler beim Speichern';
  return '';
}

function statusColor(s: SaveStatus): string {
  if (s === 'saving') return 'var(--color-primary)';
  if (s === 'saved') return 'var(--color-on-surface-variant)';
  if (s === 'error') return 'var(--color-error)';
  return 'var(--color-on-surface-variant)';
}

type ToolbarPayload = {
  content: ReturnType<NonNullable<ReturnType<typeof useEditor>>['getJSON']> | undefined;
  title: string;
  tags: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkbookEditor({ page, onSaveStatusChange, saveStatus, onPageUpdated, sectionName }: WorkbookEditorProps) {
  const [title, setTitle] = useState(page.title);
  const [tags, setTags] = useState(page.tags ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  // Frei platzierbare Bilder
  const [pageImages, setPageImages] = useState<PageImage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nextDropAt = useRef<{ x: number; y: number } | null>(null);
  // Annotationen (Pfeile & Text)
  const [annotations, setAnnotations] = useState<PageAnnotation[]>([]);
  const [annoMode, setAnnoMode] = useState<'none' | 'arrow' | 'text' | 'marker' | 'rect' | 'x' | 'draw' | 'bracket'>('none');
  const freePts = useRef<{ x: number; y: number }[]>([]);
  const [freePreview, setFreePreview] = useState<{ x: number; y: number }[] | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  // Smart-Guides: Ausrichtungslinien beim Ziehen frei platzierter Elemente.
  const [guides, setGuides] = useState<Guide[]>([]);
  // Mehrfachauswahl freier Elemente (uid = "img:<id>" | "ann:<id>").
  // selNodes ist die EINZIGE Quelle der Wahrheit; Einzelauswahl wird daraus abgeleitet.
  const [selNodes, setSelNodes] = useState<Set<string>>(new Set());
  const singleUid = selNodes.size === 1 ? [...selNodes][0] : null;
  const selectedImageId = singleUid && singleUid.startsWith('img:') ? Number(singleUid.slice(4)) : null;
  const selectedAnnoId = singleUid && singleUid.startsWith('ann:') ? Number(singleUid.slice(4)) : null;
  const setSelectedImageId = (id: number | null) => setSelNodes(id == null ? new Set() : new Set([`img:${id}`]));
  const setSelectedAnnoId = (id: number | null) => setSelNodes(id == null ? new Set() : new Set([`ann:${id}`]));
  const [marqueeMode, setMarqueeMode] = useState(false); // "Auswählen"-Werkzeug aktiv
  const [attachmentsOpen, setAttachmentsOpen] = useState(false); // Anhänge-Liste standardmäßig eingeklappt
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const marqueeStart = useRef<{ x: number; y: number } | null>(null);
  const suppressDeselectClick = useRef(false);
  const groupDrag = useRef<{ px: number; py: number; snap: Array<{ uid: string; kind: 'img' | 'text' | 'shape'; o: { x1: number; y1: number; x2: number; y2: number } }> } | null>(null);
  const [zoom, setZoom] = useState(1); // Seitenzoom (0.4 – 1.5)
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  function setZoomClamped(z: number) { setZoom(Math.min(1.5, Math.max(0.4, Math.round(z * 100) / 100))); }
  const [whiteBg, setWhiteBg] = useState(false);
  function toggleWhiteBg() {
    setWhiteBg((v) => { const n = !v; try { window.localStorage.setItem(`workbook.whiteBg.${page.id}`, n ? '1' : '0'); } catch { /* ignore */ } return n; });
  }
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [taskSlideOverOpen, setTaskSlideOverOpen] = useState(false);
  const [taskSlideOverPrefill, setTaskSlideOverPrefill] = useState<{ title?: string; area?: string; source_page_id?: number; source_page_title?: string } | undefined>();

  const [contactName, setContactName] = useState<string | null>(null);

  // Kontaktname laden wenn page.contact_id gesetzt
  useEffect(() => {
    if (!page.contact_id) { setContactName(null); return; }
    fetchContact(page.contact_id).then((c) => {
      const name = c.contact_kind === 'organization' && c.organization_name
        ? c.organization_name
        : [c.first_name, c.last_name].filter(Boolean).join(' ') || null;
      setContactName(name);
    }).catch(() => setContactName(null));
  }, [page.contact_id]);

  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  const latestPayloadRef = useRef<ToolbarPayload | null>(null);
  // Refs so onUpdate always reads the current title/tags without stale closure
  const titleRef = useRef(page.title);
  const tagsRef = useRef(page.tags ?? '');
  // Ref to always-current editor instance (avoids stale closure in handleUploadFiles)
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const doSave = useCallback(async (silent = false) => {
    const payload = latestPayloadRef.current;
    if (!payload) return;
    try {
      if (!silent) onSaveStatusChange('saving');
      if (pendingSaveRef.current) await pendingSaveRef.current;
      const p = updatePage(page.id, {
        title: payload.title,
        content: payload.content,
        tags: payload.tags,
      }).then((updated) => {
        onPageUpdated(updated);
        if (!silent) onSaveStatusChange('saved');
      }).catch(() => {
        if (!silent) onSaveStatusChange('error');
      });
      pendingSaveRef.current = p;
      await p;
      pendingSaveRef.current = null;
    } catch {
      if (!silent) onSaveStatusChange('error');
    }
  }, [page.id, onSaveStatusChange, onPageUpdated]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(doSave, 1500) as unknown as number;
  }, [doSave]);

  // Load attachments when page changes
  useEffect(() => {
    fetchAttachments(page.id).then(setAttachments).catch(() => {});
    fetchPageImages(page.id).then(setPageImages).catch(() => setPageImages([]));
    fetchAnnotations(page.id).then(setAnnotations).catch(() => setAnnotations([]));
    setSelectedImageId(null);
    setSelectedAnnoId(null);
    setAnnoMode('none');
    try { setWhiteBg(window.localStorage.getItem(`workbook.whiteBg.${page.id}`) === '1'); } catch { setWhiteBg(false); }
  }, [page.id]);

  async function handleUploadFiles(files: FileList | File[]) {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const att = await uploadAttachment(page.id, file);
        setAttachments((prev) => [...prev, att]);

        // Bild-Dateien: als frei platzierbares Bild an der Drop-Stelle anlegen
        if (file.type.startsWith('image/')) {
          const at = nextDropAt.current;
          try {
            const created = await createPageImage(
              page.id,
              at ? { attachment_id: att.id, x: Math.round(at.x), y: Math.round(at.y) } : { attachment_id: att.id },
            );
            setPageImages((prev) => [...prev, created]);
            setSelectedImageId(created.id);
            pushUndo(async () => { setPageImages((f) => f.filter((x) => x.id !== created.id)); setSelectedImageId(null); await deletePageImage(created.id).catch(() => {}); });
            if (at) nextDropAt.current = { x: at.x + 18, y: at.y + 18 }; // mehrere Bilder kaskadieren
          } catch { /* Anlegen fehlgeschlagen — Anhang bleibt */ }
          continue;
        }

        // .eml-Dateien: zusätzlich als Email-Vorschau-Card in den Editor einfügen
        const isEml =
          file.name.toLowerCase().endsWith('.eml') ||
          file.type === 'message/rfc822';

        const currentEditor = editorRef.current;
        if (isEml && currentEditor) {
          try {
            const emlData = await parseEml(file);
            currentEditor
              .chain()
              .focus()
              .insertContent({
                type: 'emailCard',
                attrs: {
                  subject:      emlData.subject,
                  from:         emlData.from,
                  date:         emlData.date,
                  preview:      emlData.preview,
                  attachmentId: att.id,
                  fileName:     file.name,
                },
              })
              .run();
          } catch {
            // Parsing fehlgeschlagen — Datei ist trotzdem als Anhang gespeichert
          }
        }
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      nextDropAt.current = null;
    }
  }

  // Bilder INLINE in einen Bereich einfügen (nicht als frei platzierte Seiten-Elemente).
  async function insertImagesIntoSection(files: File[], atPos: number) {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (imgs.length === 0) return;
    const nodes: Array<{ type: string; attrs: { attachmentId: number } }> = [];
    for (const file of imgs) {
      try {
        const att = await uploadAttachment(page.id, file);
        setAttachments((prev) => [...prev, att]);
        nodes.push({ type: 'imageAttachment', attrs: { attachmentId: att.id } });
      } catch { /* einzelnes Bild übersprungen */ }
    }
    if (nodes.length) editorRef.current?.chain().insertContentAt(atPos, nodes).run();
  }

  // Ganze Seite (Text + freie Bilder) als PNG exportieren.
  function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  // Ein Bild mit "contain"-Logik in eine Box zeichnen (wie objectFit: contain).
  function drawContain(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
    const ar = im.naturalWidth / im.naturalHeight || 1, boxAr = w / h;
    let dw: number, dh: number;
    if (ar > boxAr) { dw = w; dh = w / ar; } else { dh = h; dw = h * ar; }
    ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  async function handleExportPng() {
    const el = scrollRef.current;
    if (!el) return;
    setSelectedImageId(null);
    setSelectedAnnoId(null);
    // Zoom für den Export auf 100% neutralisieren (Canvas-Bilder rechnen in
    // Element-Koordinaten; sonst passen DOM-Abbild und Fotos nicht zusammen).
    const zoomWrap = el.querySelector(':scope > div') as HTMLElement | null;
    const prevZoomStyle = zoomWrap?.style.zoom ?? '';
    if (zoomWrap) zoomWrap.style.zoom = '1';
    await new Promise((r) => setTimeout(r, 80)); // Auswahl-Handles ausblenden + Reflow

    const W = el.scrollWidth, H = el.scrollHeight, ratio = 2;
    const bg = getComputedStyle(el).backgroundColor || '#0f161e';

    // Frei platzierte Fotos zeichnet html-to-image bei großen Bildern nicht ins
    // foreignObject -> stattdessen später per Canvas darunter zeichnen. Deshalb
    // hier ausblenden und die Text-/Annotationsebene TRANSPARENT abgreifen.
    const floatEls = Array.from(el.querySelectorAll('[data-floating-image]')) as HTMLElement[];
    const prevVis = floatEls.map((f) => f.style.visibility);
    floatEls.forEach((f) => { f.style.visibility = 'hidden'; });
    // Container-Hintergrund transparent erzwingen (Weiß-Modus nutzt !important) —
    // sonst würde das DOM-Bild die darunter gezeichneten Fotos zudecken.
    const prevBg = el.style.background;
    el.style.setProperty('background', 'transparent', 'important');
    el.setAttribute('data-exporting', ''); // blendet den Editor-Platzhalter aus

    // Inline-Bilder im Text als Data-URL einbetten (Blob-URLs rendert es nicht).
    const imgs = Array.from(el.querySelectorAll('img')) as HTMLImageElement[];
    const originals = imgs.map((im) => im.src);
    await Promise.all(imgs.map(async (im) => {
      if (im.src.startsWith('blob:') || im.src.startsWith('http') || im.src.startsWith('/')) {
        try {
          const blob = await (await fetch(im.src)).blob();
          im.src = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob); });
        } catch { /* Bild bleibt wie es ist */ }
      }
    }));

    try {
      // 1) Text + Annotationen transparent abgreifen
      const domUrl = await toPng(el, { width: W, height: H, pixelRatio: ratio, style: { overflow: 'visible' } });

      // 2) Canvas komponieren: Hintergrund -> Fotos -> Text/Annotationen darüber
      const canvas = document.createElement('canvas');
      canvas.width = W * ratio; canvas.height = H * ratio;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(ratio, ratio);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      for (const pi of pageImages) {
        try {
          const im = await loadImg(await getAttachmentDataUrl(pi.attachment_id));
          const deg = pi.rotation ?? 0;
          if (deg) {
            const ccx = pi.x + pi.width / 2, ccy = pi.y + pi.height / 2;
            ctx.save(); ctx.translate(ccx, ccy); ctx.rotate(deg * Math.PI / 180); ctx.translate(-ccx, -ccy);
            drawContain(ctx, im, pi.x, pi.y, pi.width, pi.height);
            ctx.restore();
          } else {
            drawContain(ctx, im, pi.x, pi.y, pi.width, pi.height);
          }
        } catch { /* Bild überspringen */ }
      }
      const dom = await loadImg(domUrl);
      ctx.drawImage(dom, 0, 0, W, H);

      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${(page.title || 'seite').replace(/[/\\:*?"<>|]/g, '').trim() || 'seite'}.png`;
      document.body.appendChild(a); a.click(); a.remove();
    } catch { /* Rendern fehlgeschlagen — ignorieren */ }
    finally {
      el.removeAttribute('data-exporting');
      if (prevBg) el.style.background = prevBg; else el.style.removeProperty('background');
      if (zoomWrap) zoomWrap.style.zoom = prevZoomStyle;
      floatEls.forEach((f, i) => { f.style.visibility = prevVis[i]; });
      imgs.forEach((im, i) => { im.src = originals[i]; });
    }
  }

  // Drop-/Cursor-Position relativ zum Scroll-Container (inkl. Scroll-Offset).
  function computeDropAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const el = scrollRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const z = zoomRef.current || 1;
    return { x: (clientX - rect.left + el.scrollLeft) / z, y: (clientY - rect.top + el.scrollTop) / z };
  }

  // ── Rückgängig (Undo) für freie Elemente: jede Aktion legt ihre Umkehr-Aktion ab ──
  const undoStack = useRef<Array<() => void | Promise<void>>>([]);
  const [undoCount, setUndoCount] = useState(0);
  function pushUndo(fn: () => void | Promise<void>) {
    undoStack.current.push(fn);
    if (undoStack.current.length > 60) undoStack.current.shift();
    setUndoCount(undoStack.current.length);
  }
  async function undoLast() {
    const fn = undoStack.current.pop();
    setUndoCount(undoStack.current.length);
    if (fn) { try { await fn(); } catch { /* Umkehr fehlgeschlagen — ignorieren */ } }
  }

  // ── Annotationen ──
  function commitAnnotation(id: number, patch: AnnotationPatch, record = true) {
    if (record) {
      const prev = annotations.find((a) => a.id === id);
      if (prev) {
        const inv: AnnotationPatch = {};
        (Object.keys(patch) as (keyof AnnotationPatch)[]).forEach((k) => { (inv as Record<string, unknown>)[k] = (prev as unknown as Record<string, unknown>)[k]; });
        pushUndo(() => commitAnnotation(id, inv, false));
      }
    }
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    updateAnnotation(id, patch).catch(() => {});
  }
  function removeAnnotation(id: number, record = true) {
    const prev = annotations.find((a) => a.id === id);
    setAnnotations((p) => p.filter((a) => a.id !== id));
    setSelectedAnnoId(null);
    deleteAnnotation(id).catch(() => {});
    if (record && prev) pushUndo(async () => {
      const re = await createAnnotation(page.id, { kind: prev.kind, x1: prev.x1, y1: prev.y1, x2: prev.x2, y2: prev.y2, text: prev.text, color: prev.color, size: prev.size });
      setAnnotations((p) => [...p, re]); setSelectedAnnoId(re.id);
    });
  }
  function commitImage(id: number, patch: Partial<Pick<PageImage, 'x' | 'y' | 'width' | 'height' | 'rotation'>>, record = true) {
    if (record) {
      const prev = pageImages.find((p) => p.id === id);
      if (prev) {
        const inv: Record<string, unknown> = {};
        Object.keys(patch).forEach((k) => { inv[k] = (prev as unknown as Record<string, unknown>)[k]; });
        pushUndo(() => commitImage(id, inv, false));
      }
    }
    setPageImages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    updatePageImage(id, patch).catch(() => {});
  }
  function removeImage(id: number, record = true) {
    const prev = pageImages.find((p) => p.id === id);
    setPageImages((p) => p.filter((x) => x.id !== id));
    setSelectedImageId(null);
    deletePageImage(id).catch(() => {});
    if (record && prev) pushUndo(async () => {
      const re = await createPageImage(page.id, { attachment_id: prev.attachment_id, x: prev.x, y: prev.y, width: prev.width, height: prev.height });
      let created = re;
      if (prev.rotation) { try { created = await updatePageImage(re.id, { rotation: prev.rotation }); } catch { /* Rotation-Restore optional */ } }
      setPageImages((p) => [...p, created]); setSelectedImageId(created.id); setSelectedAnnoId(null);
    });
  }
  // Ausgewählte(s) Element(e) duplizieren (leicht versetzt).
  async function duplicateSelected() {
    // Mehrfachauswahl -> alle duplizieren, danach die Kopien auswählen.
    if (selNodes.size > 1) {
      const o = 16; const newUids = new Set<string>();
      for (const uid of [...selNodes]) {
        try {
          if (uid.startsWith('ann:')) {
            const a = annotations.find((x) => x.id === Number(uid.slice(4))); if (!a) continue;
            const body = a.kind === 'text'
              ? { kind: a.kind, x1: a.x1 + o, y1: a.y1 + o, text: a.text, color: a.color, size: a.size }
              : { kind: a.kind, x1: a.x1 + o, y1: a.y1 + o, x2: a.x2 + o, y2: a.y2 + o, color: a.color, size: a.size };
            const re = await createAnnotation(page.id, body); setAnnotations((p) => [...p, re]); newUids.add(`ann:${re.id}`);
          } else {
            const im = pageImages.find((x) => x.id === Number(uid.slice(4))); if (!im) continue;
            const re = await createPageImage(page.id, { attachment_id: im.attachment_id, x: im.x + o, y: im.y + o, width: im.width, height: im.height });
            let c = re; if (im.rotation) { try { c = await updatePageImage(re.id, { rotation: im.rotation }); } catch { /* opt */ } }
            setPageImages((p) => [...p, c]); newUids.add(`img:${c.id}`);
          }
        } catch { /* einzelnes Duplikat übersprungen */ }
      }
      setSelNodes(newUids);
      pushUndo(async () => { for (const u of newUids) { if (u.startsWith('ann:')) { setAnnotations((f) => f.filter((x) => x.id !== Number(u.slice(4)))); await deleteAnnotation(Number(u.slice(4))).catch(() => {}); } else { setPageImages((f) => f.filter((x) => x.id !== Number(u.slice(4)))); await deletePageImage(Number(u.slice(4))).catch(() => {}); } } setSingleSel(null); });
      return;
    }
    if (selectedAnnoId != null) {
      const a = annotations.find((x) => x.id === selectedAnnoId);
      if (!a) return;
      const o = 16;
      const body = a.kind === 'text'
        ? { kind: a.kind, x1: a.x1 + o, y1: a.y1 + o, text: a.text, color: a.color, size: a.size }
        : { kind: a.kind, x1: a.x1 + o, y1: a.y1 + o, x2: a.x2 + o, y2: a.y2 + o, color: a.color, size: a.size };
      try {
        const re = await createAnnotation(page.id, body);
        setAnnotations((p) => [...p, re]); setSelectedAnnoId(re.id);
        pushUndo(async () => { setAnnotations((f) => f.filter((x) => x.id !== re.id)); setSelectedAnnoId(null); await deleteAnnotation(re.id).catch(() => {}); });
      } catch { /* Duplizieren fehlgeschlagen */ }
    } else if (selectedImageId != null) {
      const im = pageImages.find((x) => x.id === selectedImageId);
      if (!im) return;
      try {
        const re = await createPageImage(page.id, { attachment_id: im.attachment_id, x: im.x + 16, y: im.y + 16, width: im.width, height: im.height });
        let created = re;
        if (im.rotation) { try { created = await updatePageImage(re.id, { rotation: im.rotation }); } catch { /* optional */ } }
        setPageImages((p) => [...p, created]); setSelectedImageId(created.id);
        pushUndo(async () => { setPageImages((f) => f.filter((x) => x.id !== created.id)); setSelectedImageId(null); await deletePageImage(created.id).catch(() => {}); });
      } catch { /* Duplizieren fehlgeschlagen */ }
    }
  }
  function drawPointerDown(e: React.PointerEvent) {
    if (annoMode === 'none') return;
    const at = computeDropAt(e.clientX, e.clientY);
    if (!at) return;
    if (annoMode === 'text') {
      createAnnotation(page.id, { kind: 'text', x1: at.x, y1: at.y, color: '#111827', size: 18 })
        .then((a) => { setAnnotations((prev) => [...prev, a]); setSelectedAnnoId(a.id); pushUndo(async () => { setAnnotations((f) => f.filter((x) => x.id !== a.id)); setSelectedAnnoId(null); await deleteAnnotation(a.id).catch(() => {}); }); }).catch(() => {});
      setAnnoMode('none');
      return;
    }
    if (annoMode === 'draw') {
      freePts.current = [at]; setFreePreview([at]);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
    drawStart.current = at;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function drawPointerMove(e: React.PointerEvent) {
    if (annoMode !== 'draw' || freePts.current.length === 0) return;
    const at = computeDropAt(e.clientX, e.clientY); if (!at) return;
    const last = freePts.current[freePts.current.length - 1];
    if (Math.hypot(at.x - last.x, at.y - last.y) < 2) return; // Punkte ausdünnen
    freePts.current.push(at);
    setFreePreview([...freePts.current]);
  }
  function drawPointerUp(e: React.PointerEvent) {
    if (annoMode === 'draw') {
      const pts = freePts.current; freePts.current = []; setFreePreview(null);
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (pts.length >= 2) {
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const minX = Math.min(...xs), minY = Math.min(...ys), maxX = Math.max(...xs), maxY = Math.max(...ys);
        const rel = pts.map((p) => [Math.round(p.x - minX), Math.round(p.y - minY)]);
        createAnnotation(page.id, { kind: 'draw', x1: Math.round(minX), y1: Math.round(minY), x2: Math.round(maxX), y2: Math.round(maxY), color: '#ef4444', size: 3, text: JSON.stringify(rel) })
          .then((a) => { setAnnotations((prev) => [...prev, a]); setSelectedAnnoId(a.id); pushUndo(async () => { setAnnotations((f) => f.filter((x) => x.id !== a.id)); setSelectedAnnoId(null); await deleteAnnotation(a.id).catch(() => {}); }); }).catch(() => {});
      }
      setAnnoMode('none');
      return;
    }
    const kind = annoMode;
    if (!drawStart.current || !(kind === 'arrow' || kind === 'marker' || kind === 'rect' || kind === 'x' || kind === 'bracket')) return;
    const end = computeDropAt(e.clientX, e.clientY);
    const s = drawStart.current; drawStart.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    if (end && (Math.abs(end.x - s.x) > 6 || Math.abs(end.y - s.y) > 6)) {
      const def = kind === 'marker' ? { color: '#fde047', size: 16 } : kind === 'rect' ? { color: '#fde047', size: 2 } : kind === 'x' ? { color: '#ef4444', size: 6 } : kind === 'bracket' ? { color: '#ef4444', size: 4 } : { color: '#ef4444', size: 3 };
      createAnnotation(page.id, { kind, x1: s.x, y1: s.y, x2: end.x, y2: end.y, ...def })
        .then((a) => { setAnnotations((prev) => [...prev, a]); setSelectedAnnoId(a.id); pushUndo(async () => { setAnnotations((f) => f.filter((x) => x.id !== a.id)); setSelectedAnnoId(null); await deleteAnnotation(a.id).catch(() => {}); }); }).catch(() => {});
    }
    setAnnoMode('none');
  }

  async function handleDeleteAttachment(id: number) {
    if (!window.confirm('Anhang wirklich löschen?')) return;
    await deleteAttachment(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${selectedIds.size} Anhang/Anhänge wirklich löschen?`)) return;
    await Promise.all([...selectedIds].map((id) => deleteAttachment(id)));
    setAttachments((prev) => prev.filter((a) => !selectedIds.has(a.id)));
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  // Extrahiert File-Objekte aus einem DragEvent — unterstützt sowohl
  // normale Finder-Drops (dt.files/items) als auch Mail.app-Drops,
  // bei denen die E-Mail als message/rfc822-String übergeben wird.
  function extractDropFiles(dt: DataTransfer): File[] {
    console.log('[drop] types:', Array.from(dt.types));
    const files: File[] = [];

    // 1) Normale Datei-Items (Finder, andere Browser-Drops)
    if (dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i++) {
        const item = dt.items[i];
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) { console.log('[drop] file item:', f.name, f.type, f.size); files.push(f); }
        }
      }
    }
    if (files.length === 0 && dt.files.length > 0) {
      for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
    }

    // 2) Mail.app: liefert E-Mail als message/rfc822 String-Item statt als File
    if (files.length === 0 && dt.types.includes('message/rfc822')) {
      const raw = dt.getData('message/rfc822');
      if (raw) {
        const subject = raw.match(/^Subject:\s*(.+)$/mi)?.[1]?.trim() ?? 'email';
        const safeName = subject.replace(/[/\\:*?"<>|]/g, '').trim().slice(0, 60) || 'email';
        const blob = new Blob([raw], { type: 'message/rfc822' });
        const syntheticFile = new File([blob], `${safeName}.eml`, { type: 'message/rfc822' });
        console.log('[drop] Mail.app string fallback → synthetic .eml:', syntheticFile.name);
        files.push(syntheticFile);
      }
    }

    return files;
  }

  const editor = useEditor({
    // Keep editorRef current so handleUploadFiles never reads a stale null closure
    onCreate: ({ editor: ed }) => { editorRef.current = ed; },
    onDestroy: () => { editorRef.current = null; },
    editorProps: {
      handleDrop: (view, event) => {
        const dt = event.dataTransfer;
        if (!dt) return false;
        const files = extractDropFiles(dt);
        if (files.length > 0) {
          event.preventDefault();
          setDragOver(false);
          // Landet der Drop innerhalb eines Bereichs? -> Bild(er) INLINE in den Bereich.
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (at) {
            const $pos = view.state.doc.resolve(at.pos);
            for (let d = $pos.depth; d > 0; d--) {
              if ($pos.node(d).type.name === 'sectionBlock') {
                const endInside = $pos.before(d) + $pos.node(d).nodeSize - 1;
                insertImagesIntoSection(files, endInside);
                return true;
              }
            }
          }
          // sonst: frei platziertes Seiten-Bild wie bisher
          nextDropAt.current = computeDropAt(event.clientX, event.clientY);
          handleUploadFiles(files);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        const imgs: File[] = [];
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.kind === 'file' && it.type.startsWith('image/')) {
            const f = it.getAsFile();
            if (f) imgs.push(f);
          }
        }
        if (imgs.length > 0) {
          event.preventDefault();
          handleUploadFiles(imgs);
          return true;
        }
        return false;
      },
    },
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder: 'Hier tippen — Seite bearbeiten...' }),
      CharacterCount,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      EmailCardExtension,
      ImageAttachmentExtension,
      SectionBlockExtension,
    ],
    content: (() => {
      try {
        return typeof page.content === 'string' ? JSON.parse(page.content) : page.content;
      } catch {
        return page.content;
      }
    })(),
    onUpdate: ({ editor: ed }) => {
      const content = ed.getJSON();
      latestPayloadRef.current = { content, title: titleRef.current, tags: tagsRef.current };
      scheduleSave();
    },
  }, [page.id]);

  // Destroy cleanup
  useEffect(() => {
    return () => {
      editor?.destroy();
    };
  }, [editor]);

  // Pro-Bereich-PDF-Export: Handler in den Editor-Storage hängen (kennt page.id).
  useEffect(() => {
    if (!editor) return;
    const store = (editor.storage as unknown as Record<string, unknown>).sectionBlock as { onExportPdf: ((i: number, t: string) => void) | null; onAddImage: ((files: File[], atPos: number) => void) | null } | undefined;
    if (store) {
      store.onExportPdf = (idx, filename) => { exportWorkbook({ format: 'pdf', page_id: page.id, section_index: idx, filename }).catch(() => {}); };
      store.onAddImage = (files, atPos) => { insertImagesIntoSection(files, atPos); };
    }
  }, [editor, page.id]);

  // Sync title/tags when page changes; reset select mode
  useEffect(() => {
    setTitle(page.title);
    titleRef.current = page.title;
    setTags(page.tags ?? '');
    tagsRef.current = page.tags ?? '';
    latestPayloadRef.current = null;
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [page.id]);

  // Unmount / page switch: cancel timer + immediate save
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (latestPayloadRef.current) {
        doSave(true);
        latestPayloadRef.current = null;
      }
    };
  }, [page.id, doSave]);

  // Entf/Backspace löscht das ausgewählte Element. Nur wenn wirklich etwas ausgewählt ist,
  // und nicht beim Tippen in einer Textbox oder im Titel/Tags-Feld.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const inField = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      const inProse = !!el?.closest?.('.ProseMirror');
      const editingText = !!el?.isContentEditable && !inProse; // Textbox-Annotation editieren
      const meta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+D -> ausgewählte(s) Element(e) duplizieren
      if (meta && (e.key === 'd' || e.key === 'D')) {
        if (selectedAnnoId != null || selectedImageId != null || selNodes.size > 0) { e.preventDefault(); duplicateSelected(); }
        return;
      }
      // Cmd/Ctrl+Z -> Rückgängig (nur außerhalb von Textfeldern/Editor; dort greift die native Undo)
      if (meta && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        if (!inField && !inProse && !editingText) { e.preventDefault(); undoLast(); }
        return;
      }
      // Entf/Backspace -> ausgewählte(s) Element(e) löschen
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnoId == null && selectedImageId == null && selNodes.size === 0) return; // nichts ausgewählt -> normal editieren
        if (inField) return; // Titel/Tags-Eingabefeld -> normal löschen
        const sel = annotations.find((a) => a.id === selectedAnnoId);
        if (sel?.kind === 'text' && editingText) return; // in Text-Annotation getippt -> Text editieren
        e.preventDefault();
        deleteSelection();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedAnnoId, selectedImageId, annotations, pageImages, selNodes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTogglePin() {
    const updated = await togglePin(page.id);
    onPageUpdated(updated);
  }

  async function handleToggleArchive() {
    const updated = await toggleArchive(page.id);
    onPageUpdated(updated);
  }

  async function handleToggleTemplate() {
    const updated = await toggleTemplate(page.id);
    onPageUpdated(updated);
  }

  // "An Herstellerin gesendet"-Markierung: setzen (mit Notiz), Notiz bearbeiten oder entfernen.
  async function handleToggleSent() {
    if (page.sent_at) {
      if (!window.confirm('Markierung „an Herstellerin gesendet" entfernen?')) return;
      onPageUpdated(await setPageSent(page.id, { sent_at: null, sent_note: null }));
    } else {
      const note = window.prompt('Notiz zur gesendeten Version (optional), z.B. „v1 an Jing":', '');
      if (note === null) return; // Abbrechen
      onPageUpdated(await setPageSent(page.id, { sent_at: Math.floor(Date.now() / 1000), sent_note: note.trim() || null }));
    }
  }
  async function handleEditSentNote() {
    const note = window.prompt('Notiz zur gesendeten Version:', page.sent_note ?? '');
    if (note === null) return;
    onPageUpdated(await setPageSent(page.id, { sent_note: note.trim() || null }));
  }

  function handleAddLink() {
    if (!editor) return;
    const url = window.prompt('URL eingeben:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }

  const toolbarBtn = (active: boolean, onClick: () => void, icon: string, title: string) => (
    <button
      key={icon + title}
      onClick={onClick}
      title={title}
      style={{
        padding: '0.3rem 0.45rem',
        background: active ? 'rgba(148,170,255,0.15)' : 'transparent',
        border: 'none',
        borderRadius: '0.3rem',
        cursor: 'pointer',
        color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
        fontSize: '0.85rem',
        fontFamily: 'var(--font-body)',
        fontWeight: active ? 700 : 400,
        transition: 'background 0.1s',
      }}
    >
      {icon}
    </button>
  );

  const iconBtn = (active: boolean, onClick: () => void, materialIcon: string, title: string) => (
    <button
      key={materialIcon + title}
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0.4rem',
        background: active ? 'rgba(148,170,255,0.15)' : 'transparent',
        border: 'none',
        borderRadius: '0.35rem',
        cursor: 'pointer',
        color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
        transition: 'background 0.1s',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '1.35rem' }}>{materialIcon}</span>
    </button>
  );
  const alignBtn = (icon: string, title: string, onClick: () => void, color?: string) => (
    <button type="button" title={title} onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', padding: '0.3rem', background: 'transparent', border: 'none', borderRadius: '0.35rem', cursor: 'pointer', color: color ?? 'var(--color-on-surface)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '1.4rem' }}>{icon}</span>
    </button>
  );

  // Unterster Rand aller frei platzierten Elemente -> Scroll-Bereich mindestens so hoch,
  // damit man sie erreichen kann (absolute Elemente erweitern scrollHeight nicht von selbst).
  const contentBottom = Math.max(
    0,
    ...pageImages.map((i) => i.y + i.height),
    ...annotations.map((a) => Math.max(a.y1, a.y2) + (a.kind === 'text' ? a.size + 30 : 30)),
  );

  // Bounding-Boxen aller frei platzierten Elemente (mit UID) für die Smart-Guides.
  function elementBounds(): { uid: string; b: Bounds }[] {
    const out: { uid: string; b: Bounds }[] = [];
    for (const i of pageImages) out.push({ uid: `img:${i.id}`, b: { left: i.x, top: i.y, right: i.x + i.width, bottom: i.y + i.height } });
    for (const a of annotations) {
      if (a.kind === 'text') {
        const w = Math.max(20, (a.text.length || 3) * a.size * 0.5), h = a.size * 1.4;
        out.push({ uid: `ann:${a.id}`, b: { left: a.x1, top: a.y1, right: a.x1 + w, bottom: a.y1 + h } });
      } else {
        out.push({ uid: `ann:${a.id}`, b: { left: Math.min(a.x1, a.x2), top: Math.min(a.y1, a.y2), right: Math.max(a.x1, a.x2), bottom: Math.max(a.y1, a.y2) } });
      }
    }
    return out;
  }
  // Während des Ziehens gegen alle anderen Elemente einrasten + Linien setzen.
  function snapFor(uid: string, moving: Bounds, opts?: SnapOpts): { dx: number; dy: number } {
    const targets = elementBounds().filter((t) => t.uid !== uid).map((t) => t.b);
    const res = snapBounds(moving, targets, opts);
    setGuides(res.guides);
    return { dx: res.dx, dy: res.dy };
  }
  function endSnap() { setGuides([]); }

  // ── Mehrfachauswahl & Ausrichten (selNodes = einzige Quelle der Wahrheit) ──
  function setSingleSel(uid: string | null) { setSelNodes(uid == null ? new Set() : new Set([uid])); }
  function selectNode(uid: string, additive?: boolean) {
    if (!additive) { setSingleSel(uid); return; }
    // Additive Auswahl (Shift/Cmd): neues Set aus aktuellem State berechnen.
    const n = new Set(selNodes);
    if (n.has(uid)) n.delete(uid); else n.add(uid);
    setSelNodes(n);
  }
  function boundsOfUid(uid: string): Bounds | null {
    if (uid.startsWith('img:')) { const i = pageImages.find((p) => p.id === Number(uid.slice(4))); return i ? { left: i.x, top: i.y, right: i.x + i.width, bottom: i.y + i.height } : null; }
    const a = annotations.find((x) => x.id === Number(uid.slice(4))); if (!a) return null;
    if (a.kind === 'text') { const w = Math.max(20, (a.text.length || 3) * a.size * 0.5); return { left: a.x1, top: a.y1, right: a.x1 + w, bottom: a.y1 + a.size * 1.4 }; }
    return { left: Math.min(a.x1, a.x2), top: Math.min(a.y1, a.y2), right: Math.max(a.x1, a.x2), bottom: Math.max(a.y1, a.y2) };
  }
  function selItems(): Array<{ uid: string; b: Bounds }> {
    const out: Array<{ uid: string; b: Bounds }> = [];
    for (const uid of selNodes) { const b = boundsOfUid(uid); if (b) out.push({ uid, b }); }
    return out;
  }
  function groupBounds(): Bounds | null {
    const items = selItems(); if (items.length === 0) return null;
    return { left: Math.min(...items.map((i) => i.b.left)), top: Math.min(...items.map((i) => i.b.top)), right: Math.max(...items.map((i) => i.b.right)), bottom: Math.max(...items.map((i) => i.b.bottom)) };
  }
  // Verschiebe-Patch je Element (ohne Undo-Aufzeichnung — Aufrufer bündelt Undo).
  function moveUidBy(uid: string, dx: number, dy: number, record: boolean) {
    if (uid.startsWith('img:')) { const id = Number(uid.slice(4)); const i = pageImages.find((p) => p.id === id); if (i) commitImage(id, { x: Math.round(i.x + dx), y: Math.round(i.y + dy) }, record); return; }
    const id = Number(uid.slice(4)); const a = annotations.find((x) => x.id === id); if (!a) return;
    if (a.kind === 'text') commitAnnotation(id, { x1: Math.round(a.x1 + dx), y1: Math.round(a.y1 + dy) }, record);
    else commitAnnotation(id, { x1: Math.round(a.x1 + dx), y1: Math.round(a.y1 + dy), x2: Math.round(a.x2 + dx), y2: Math.round(a.y2 + dy) }, record);
  }
  function capturePos(uids: string[]): Array<{ uid: string; patch: Record<string, number> }> {
    const snap: Array<{ uid: string; patch: Record<string, number> }> = [];
    for (const uid of uids) {
      if (uid.startsWith('img:')) { const i = pageImages.find((p) => p.id === Number(uid.slice(4))); if (i) snap.push({ uid, patch: { x: i.x, y: i.y } }); }
      else { const a = annotations.find((x) => x.id === Number(uid.slice(4))); if (a) snap.push({ uid, patch: a.kind === 'text' ? { x1: a.x1, y1: a.y1 } : { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 } }); }
    }
    return snap;
  }
  function pushUndoRestore(snap: Array<{ uid: string; patch: Record<string, number> }>) {
    pushUndo(() => { for (const s of snap) { if (s.uid.startsWith('img:')) commitImage(Number(s.uid.slice(4)), s.patch, false); else commitAnnotation(Number(s.uid.slice(4)), s.patch, false); } });
  }
  function alignSelection(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const items = selItems(); if (items.length < 2) return;
    const gb = groupBounds()!; const gcx = (gb.left + gb.right) / 2, gcy = (gb.top + gb.bottom) / 2;
    const orig = capturePos(items.map((i) => i.uid));
    for (const it of items) {
      const w = it.b.right - it.b.left, h = it.b.bottom - it.b.top;
      let dx = 0, dy = 0;
      if (mode === 'left') dx = gb.left - it.b.left;
      else if (mode === 'right') dx = gb.right - it.b.right;
      else if (mode === 'hcenter') dx = gcx - (it.b.left + w / 2);
      else if (mode === 'top') dy = gb.top - it.b.top;
      else if (mode === 'bottom') dy = gb.bottom - it.b.bottom;
      else if (mode === 'vcenter') dy = gcy - (it.b.top + h / 2);
      if (dx || dy) moveUidBy(it.uid, dx, dy, false);
    }
    pushUndoRestore(orig);
  }
  function distributeSelection(axis: 'h' | 'v') {
    const items = selItems(); if (items.length < 3) return;
    const center = (b: Bounds) => axis === 'h' ? (b.left + b.right) / 2 : (b.top + b.bottom) / 2;
    const sorted = [...items].sort((a, b) => center(a.b) - center(b.b));
    const first = center(sorted[0].b), last = center(sorted[sorted.length - 1].b);
    const step = (last - first) / (sorted.length - 1);
    const orig = capturePos(sorted.map((i) => i.uid));
    sorted.forEach((it, idx) => { const d = (first + step * idx) - center(it.b); if (Math.abs(d) > 0.5) { if (axis === 'h') moveUidBy(it.uid, d, 0, false); else moveUidBy(it.uid, 0, d, false); } });
    pushUndoRestore(orig);
  }
  function deleteSelection() {
    const uids = [...selNodes];
    if (uids.length <= 1) { if (selectedAnnoId != null) removeAnnotation(selectedAnnoId); else if (selectedImageId != null) removeImage(selectedImageId); return; }
    const annos = annotations.filter((a) => uids.includes(`ann:${a.id}`));
    const imgs = pageImages.filter((p) => uids.includes(`img:${p.id}`));
    setAnnotations((prev) => prev.filter((a) => !uids.includes(`ann:${a.id}`)));
    setPageImages((prev) => prev.filter((p) => !uids.includes(`img:${p.id}`)));
    setSingleSel(null);
    annos.forEach((a) => deleteAnnotation(a.id).catch(() => {}));
    imgs.forEach((p) => deletePageImage(p.id).catch(() => {}));
    pushUndo(async () => {
      const reUids = new Set<string>();
      for (const a of annos) { const re = await createAnnotation(page.id, { kind: a.kind, x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2, text: a.text, color: a.color, size: a.size }); setAnnotations((p) => [...p, re]); reUids.add(`ann:${re.id}`); }
      for (const im of imgs) { const re = await createPageImage(page.id, { attachment_id: im.attachment_id, x: im.x, y: im.y, width: im.width, height: im.height }); let c = re; if (im.rotation) { try { c = await updatePageImage(re.id, { rotation: im.rotation }); } catch { /* opt */ } } setPageImages((p) => [...p, c]); reUids.add(`img:${c.id}`); }
      setSelNodes(reUids);
    });
  }
  // Gruppen-Verschieben über das Auswahl-Rechteck.
  function groupDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    groupDrag.current = { px: e.clientX, py: e.clientY, snap: [...selNodes].map((uid) => {
      if (uid.startsWith('img:')) { const i = pageImages.find((p) => p.id === Number(uid.slice(4)))!; return { uid, kind: 'img' as const, o: { x1: i.x, y1: i.y, x2: 0, y2: 0 } }; }
      const a = annotations.find((x) => x.id === Number(uid.slice(4)))!; return { uid, kind: (a.kind === 'text' ? 'text' : 'shape') as 'text' | 'shape', o: { x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 } };
    }) };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault();
  }
  function groupMove(e: React.PointerEvent) {
    const g = groupDrag.current; if (!g) return;
    const z = zoomRef.current || 1;
    const dx = (e.clientX - g.px) / z, dy = (e.clientY - g.py) / z;
    setPageImages((prev) => prev.map((p) => { const s = g.snap.find((x) => x.uid === `img:${p.id}`); return s ? { ...p, x: Math.max(0, s.o.x1 + dx), y: Math.max(0, s.o.y1 + dy) } : p; }));
    setAnnotations((prev) => prev.map((a) => { const s = g.snap.find((x) => x.uid === `ann:${a.id}`); if (!s) return a; return s.kind === 'text' ? { ...a, x1: Math.max(0, s.o.x1 + dx), y1: Math.max(0, s.o.y1 + dy) } : { ...a, x1: s.o.x1 + dx, y1: s.o.y1 + dy, x2: s.o.x2 + dx, y2: s.o.y2 + dy }; }));
  }
  function groupUp(e: React.PointerEvent) {
    const g = groupDrag.current; if (!g) return;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); groupDrag.current = null;
    const z = zoomRef.current || 1;
    const dx = (e.clientX - g.px) / z, dy = (e.clientY - g.py) / z;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const restore = g.snap.map((s) => {
      const patch: Record<string, number> = s.kind === 'img' ? { x: s.o.x1, y: s.o.y1 } : s.kind === 'text' ? { x1: s.o.x1, y1: s.o.y1 } : { x1: s.o.x1, y1: s.o.y1, x2: s.o.x2, y2: s.o.y2 };
      return { uid: s.uid, patch };
    });
    for (const s of g.snap) {
      if (s.kind === 'img') updatePageImage(Number(s.uid.slice(4)), { x: Math.round(s.o.x1 + dx), y: Math.round(s.o.y1 + dy) }).catch(() => {});
      else if (s.kind === 'text') updateAnnotation(Number(s.uid.slice(4)), { x1: Math.round(s.o.x1 + dx), y1: Math.round(s.o.y1 + dy) }).catch(() => {});
      else updateAnnotation(Number(s.uid.slice(4)), { x1: Math.round(s.o.x1 + dx), y1: Math.round(s.o.y1 + dy), x2: Math.round(s.o.x2 + dx), y2: Math.round(s.o.y2 + dy) }).catch(() => {});
    }
    pushUndoRestore(restore);
  }
  // Aufziehauswahl über das "Auswählen"-Werkzeug (Vollflächen-Overlay).
  function marqueeDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const at = computeDropAt(e.clientX, e.clientY); if (!at) return;
    marqueeStart.current = at; setMarquee({ x1: at.x, y1: at.y, x2: at.x, y2: at.y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); e.preventDefault();
  }
  function marqueeMove(e: React.PointerEvent) {
    if (!marqueeStart.current) return;
    const at = computeDropAt(e.clientX, e.clientY); if (!at) return;
    setMarquee({ x1: marqueeStart.current.x, y1: marqueeStart.current.y, x2: at.x, y2: at.y });
  }
  function marqueeUp(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const m = marquee; const had = marqueeStart.current; marqueeStart.current = null; setMarquee(null); setMarqueeMode(false);
    if (!had || !m) { return; }
    const rl = Math.min(m.x1, m.x2), rr = Math.max(m.x1, m.x2), rt = Math.min(m.y1, m.y2), rb = Math.max(m.y1, m.y2);
    if (rr - rl < 5 && rb - rt < 5) { setSingleSel(null); return; }
    const hits = new Set<string>();
    for (const it of elementBounds()) { const b = it.b; if (b.left < rr && b.right > rl && b.top < rb && b.bottom > rt) hits.add(it.uid); }
    setSelNodes(hits);
    if (hits.size > 0) suppressDeselectClick.current = true;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--color-surface)' }}>
      {/* Toolbar — bleibt beim Scrollen oben fixiert */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-outline-variant)',
          padding: '0.5rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.15rem',
          flexWrap: 'wrap',
        }}
      >
        {toolbarBtn(editor?.isActive('bold') ?? false, () => editor?.chain().focus().toggleBold().run(), 'B', 'Fett')}
        {toolbarBtn(editor?.isActive('italic') ?? false, () => editor?.chain().focus().toggleItalic().run(), 'I', 'Kursiv')}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        {toolbarBtn(editor?.isActive('heading', { level: 1 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 1 }).run(), 'H1', 'Überschrift 1')}
        {toolbarBtn(editor?.isActive('heading', { level: 2 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), 'H2', 'Überschrift 2')}
        {toolbarBtn(editor?.isActive('heading', { level: 3 }) ?? false, () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), 'H3', 'Überschrift 3')}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        {iconBtn(editor?.isActive('bulletList') ?? false, () => editor?.chain().focus().toggleBulletList().run(), 'format_list_bulleted', 'Aufzählung')}
        {iconBtn(editor?.isActive('orderedList') ?? false, () => editor?.chain().focus().toggleOrderedList().run(), 'format_list_numbered', 'Nummerierte Liste')}
        {iconBtn(editor?.isActive('taskList') ?? false, () => editor?.chain().focus().toggleTaskList().run(), 'checklist', 'Checkliste')}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        {iconBtn(editor?.isActive('blockquote') ?? false, () => editor?.chain().focus().toggleBlockquote().run(), 'format_quote', 'Zitat')}
        {iconBtn(editor?.isActive('code') ?? false, () => editor?.chain().focus().toggleCode().run(), 'code', 'Code')}
        {iconBtn(editor?.isActive('link') ?? false, handleAddLink, 'link', 'Link einfügen')}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        {iconBtn(false, () => editor?.chain().focus().insertSectionBlock().run(), 'view_stream', 'Neuer Bereich (klappbarer Abschnitt mit Titel)')}
        {iconBtn(false, () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), 'grid_on', 'Tabelle einfügen')}
        {editor?.isActive('table') && (
          <>
            {iconBtn(false, () => editor?.chain().focus().addColumnAfter().run(), 'view_column', 'Spalte hinzufügen')}
            {iconBtn(false, () => editor?.chain().focus().addRowAfter().run(), 'table_rows', 'Zeile hinzufügen')}
            {iconBtn(false, () => editor?.chain().focus().deleteColumn().run(), 'variables', 'Spalte löschen')}
            {iconBtn(false, () => editor?.chain().focus().deleteRow().run(), 'delete_sweep', 'Zeile löschen')}
            {iconBtn(false, () => editor?.chain().focus().deleteTable().run(), 'grid_off', 'Tabelle löschen')}
          </>
        )}

        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        {iconBtn(editor?.isActive('highlight') ?? false, () => editor?.chain().focus().toggleHighlight({ color: '#fde047' }).run(), 'ink_highlighter', 'Textmarker (gelb)')}
        {['#ef4444', '#3b82f6', '#22c55e', '#eab308'].map((c) => (
          <button key={c} type="button" title={`Textfarbe ${c}`} onClick={() => editor?.chain().focus().setColor(c).run()}
            style={{ width: 15, height: 15, borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.35)', cursor: 'pointer', margin: '0 1px', flexShrink: 0 }} />
        ))}
        {iconBtn(false, () => editor?.chain().focus().unsetColor().unsetHighlight().run(), 'format_color_reset', 'Farbe & Marker zurücksetzen')}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Rückgängig + Duplizieren (freie Elemente) */}
        <button
          type="button" onClick={undoLast} disabled={undoCount === 0} title="Rückgängig (Cmd/Ctrl+Z)"
          style={{ display: 'flex', alignItems: 'center', padding: '0.3rem', background: 'transparent', border: 'none', borderRadius: '0.3rem', cursor: undoCount === 0 ? 'default' : 'pointer', color: undoCount === 0 ? 'var(--color-outline-variant)' : 'var(--color-on-surface-variant)' }}
        ><span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>undo</span></button>
        <button
          type="button" onClick={duplicateSelected} disabled={selectedAnnoId == null && selectedImageId == null} title="Duplizieren (Cmd/Ctrl+D)"
          style={{ display: 'flex', alignItems: 'center', padding: '0.3rem', background: 'transparent', border: 'none', borderRadius: '0.3rem', cursor: (selectedAnnoId == null && selectedImageId == null) ? 'default' : 'pointer', color: (selectedAnnoId == null && selectedImageId == null) ? 'var(--color-outline-variant)' : 'var(--color-on-surface-variant)' }}
        ><span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>content_copy</span></button>
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />

        {/* Page actions */}
        {iconBtn(page.is_pinned === 1, handleTogglePin, 'push_pin', page.is_pinned ? 'Pin entfernen' : 'Pinnen')}
        {iconBtn(page.is_archived === 1, handleToggleArchive, 'archive', page.is_archived ? 'Archivierung aufheben' : 'Archivieren')}
        {iconBtn(page.is_template === 1, handleToggleTemplate, 'bookmark', page.is_template ? 'Vorlage entfernen' : 'Als Vorlage')}
        {iconBtn(!!page.sent_at, handleToggleSent, 'forward_to_inbox', page.sent_at ? 'Markierung „gesendet" entfernen' : 'Als „an Herstellerin gesendet" markieren')}
        {iconBtn(false, () => { exportWorkbook({ format: 'pdf', page_id: page.id }).catch(() => {}); }, 'picture_as_pdf', 'Diese Seite als PDF')}
        {iconBtn(false, handleExportPng, 'image', 'Diese Seite als PNG')}
        {iconBtn(annoMode === 'arrow', () => setAnnoMode((m) => (m === 'arrow' ? 'none' : 'arrow')), 'arrow_outward', 'Pfeil zeichnen')}
        {iconBtn(annoMode === 'text', () => setAnnoMode((m) => (m === 'text' ? 'none' : 'text')), 'title', 'Text hinzufügen')}
        {iconBtn(annoMode === 'marker', () => setAnnoMode((m) => (m === 'marker' ? 'none' : 'marker')), 'ink_pen', 'Marker-Streifen (überall, auch auf Bildern)')}
        {iconBtn(annoMode === 'rect', () => setAnnoMode((m) => (m === 'rect' ? 'none' : 'rect')), 'crop_square', 'Markier-Rechteck')}
        {iconBtn(annoMode === 'x', () => setAnnoMode((m) => (m === 'x' ? 'none' : 'x')), 'close', 'X zum Markieren (aufziehen, Farbe/Größe änderbar)')}
        {iconBtn(annoMode === 'draw', () => setAnnoMode((m) => (m === 'draw' ? 'none' : 'draw')), 'gesture', 'Freihand zeichnen (Stift)')}
        {iconBtn(annoMode === 'bracket', () => setAnnoMode((m) => (m === 'bracket' ? 'none' : 'bracket')), 'straighten', 'Eingrenzen (H-Bügel, Breite/Höhe ziehbar)')}
        {iconBtn(marqueeMode, () => { setAnnoMode('none'); setMarqueeMode((v) => !v); }, 'highlight_alt', 'Mehrere auswählen — Rahmen aufziehen')}
        {iconBtn(whiteBg, toggleWhiteBg, 'contrast', 'Weißer Hintergrund')}
        {/* Seitenzoom */}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        {iconBtn(false, () => setZoomClamped(zoom - 0.1), 'zoom_out', 'Rauszoomen')}
        <button type="button" onClick={() => setZoomClamped(1)} title="Zoom zurücksetzen (100%)"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', fontSize: '0.72rem', fontWeight: 600, minWidth: '2.4rem', padding: '0.2rem 0.1rem' }}>
          {Math.round(zoom * 100)}%
        </button>
        {iconBtn(false, () => setZoomClamped(zoom + 0.1), 'zoom_in', 'Reinzoomen')}

        {/* Kontakt-Zuordnung */}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        <ContactPicker
          contactId={page.contact_id ?? null}
          contactName={contactName}
          compact
          onChange={async (newContactId, newName) => {
            setContactName(newName);
            const updated = await updatePageContact(page.id, newContactId);
            onPageUpdated(updated);
          }}
        />

        {/* + Aufgabe Button */}
        <div style={{ width: '1px', height: '1.2rem', background: 'var(--color-outline-variant)', margin: '0 0.2rem' }} />
        <button
          onClick={() => {
            setTaskSlideOverPrefill({ title: page.title, area: sectionName ?? '', source_page_id: page.id, source_page_title: page.title });
            setTaskSlideOverOpen(true);
          }}
          title="Aufgabe aus dieser Seite erstellen"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            padding: '0.3rem 0.6rem',
            background: 'rgba(148,170,255,0.1)',
            border: '1px solid rgba(148,170,255,0.25)',
            borderRadius: '0.3rem',
            cursor: 'pointer',
            color: 'var(--color-primary)',
            fontSize: '0.78rem',
            fontFamily: 'var(--font-body)',
            fontWeight: 600,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>add_task</span>
          + Aufgabe
        </button>
      </div>

      {/* Title */}
      <div style={{ padding: '1.5rem 0 0.5rem' }}>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            titleRef.current = e.target.value;
            latestPayloadRef.current = {
              content: editor?.getJSON(),
              title: e.target.value,
              tags: tagsRef.current,
            };
            scheduleSave();
          }}
          placeholder="Unbenannte Seite"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-headline)',
            fontWeight: 800,
            fontSize: '2rem',
            letterSpacing: '-0.02em',
            color: 'var(--color-on-surface)',
            padding: '0 2rem',
            boxSizing: 'border-box',
          }}
        />

        {/* Tags */}
        <input
          value={tags}
          onChange={(e) => {
            setTags(e.target.value);
            tagsRef.current = e.target.value;
            latestPayloadRef.current = {
              content: editor?.getJSON(),
              title: titleRef.current,
              tags: e.target.value,
            };
            scheduleSave();
          }}
          placeholder="Tags (kommagetrennt)"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            color: 'var(--color-on-surface-variant)',
            padding: '0.25rem 2rem 0',
            boxSizing: 'border-box',
          }}
        />

        {/* "An Herstellerin gesendet"-Badge (Datum + Notiz) */}
        {page.sent_at && (
          <div style={{ margin: '0.4rem 2rem 0', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', alignSelf: 'flex-start', padding: '0.2rem 0.6rem', borderRadius: '999px', background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.4)', color: '#4ade80', fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 600 }}>
            <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>check_circle</span>
            <span>Gesendet am {new Date(page.sent_at * 1000).toLocaleDateString('de-DE')}</span>
            {page.sent_note && <span style={{ fontWeight: 400, opacity: 0.9 }}>— {page.sent_note}</span>}
            <button type="button" onClick={handleEditSentNote} title="Notiz bearbeiten" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex', alignItems: 'center', padding: 0, marginLeft: '0.15rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>edit</span>
            </button>
          </div>
        )}

      </div>

      {/* Editor with drag-and-drop */}
      <div
        ref={scrollRef}
        data-white-bg={whiteBg ? '' : undefined}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', position: 'relative' }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
        onClick={() => { if (suppressDeselectClick.current) { suppressDeselectClick.current = false; return; } setSingleSel(null); }}
        onDrop={(e) => {
          setDragOver(false);
          const files = extractDropFiles(e.dataTransfer);
          if (files.length > 0) {
            e.preventDefault(); // nur verhindern wenn wir selbst verarbeiten
            nextDropAt.current = computeDropAt(e.clientX, e.clientY);
            handleUploadFiles(files);
          }
          // kein preventDefault bei reinen Text-Drops → TipTap fügt Text normal ein
        }}
      >
        <div style={{ position: 'relative', minHeight: contentBottom > 0 ? contentBottom : undefined, zoom }}>
        <EditorContent editor={editor} />
        {/* Frei platzierbare Bilder */}
        {pageImages.map((img) => (
          <FloatingImage
            key={img.id}
            image={img}
            selected={selectedImageId === img.id}
            zoom={zoom}
            onSelect={(additive) => selectNode(`img:${img.id}`, additive)}
            onCommit={(patch) => commitImage(img.id, patch)}
            onDelete={() => removeImage(img.id)}
            onSnap={(b, opts) => snapFor(`img:${img.id}`, b, opts)}
            onSnapEnd={endSnap}
          />
        ))}
        {/* Annotationen: Pfeile, Marker, Rechtecke & Text */}
        {annotations.map((a) => {
          const common = { key: a.id, anno: a, selected: selectedAnnoId === a.id, zoom,
            onSelect: (additive?: boolean) => selectNode(`ann:${a.id}`, additive), onCommit: (p: AnnotationPatch) => commitAnnotation(a.id, p), onDelete: () => removeAnnotation(a.id),
            onSnap: (b: Bounds, opts?: SnapOpts) => snapFor(`ann:${a.id}`, b, opts), onSnapEnd: endSnap };
          if (a.kind === 'rect') return <RectAnnotation {...common} />;
          if (a.kind === 'x') return <XAnnotation {...common} />;
          if (a.kind === 'bracket') return <HBracketAnnotation {...common} />;
          if (a.kind === 'draw') return <DrawAnnotation {...common} />;
          if (a.kind === 'text') return <TextAnnotation {...common} />;
          return <ArrowAnnotation {...common} />; // arrow + marker
        })}
        {/* Smart-Guides: Ausrichtungslinien beim Ziehen */}
        {guides.length > 0 && (
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 70 }}>
            {guides.map((g, i) => g.axis === 'v'
              ? <line key={i} x1={g.pos} y1={g.start} x2={g.pos} y2={g.end} stroke="#ff2d95" strokeWidth={1} shapeRendering="crispEdges" />
              : <line key={i} x1={g.start} y1={g.pos} x2={g.end} y2={g.pos} stroke="#ff2d95" strokeWidth={1} shapeRendering="crispEdges" />)}
          </svg>
        )}
        {/* Freihand-Live-Vorschau beim Zeichnen */}
        {freePreview && freePreview.length > 1 && (
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', zIndex: 60 }}>
            <polyline points={freePreview.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {/* Marquee (Aufziehauswahl) */}
        {marquee && (
          <div style={{ position: 'absolute', left: Math.min(marquee.x1, marquee.x2), top: Math.min(marquee.y1, marquee.y2), width: Math.abs(marquee.x2 - marquee.x1), height: Math.abs(marquee.y2 - marquee.y1), border: '1px solid var(--color-primary)', background: 'rgba(148,170,255,0.12)', zIndex: 68, pointerEvents: 'none', borderRadius: 2 }} />
        )}
        {/* Mehrfachauswahl: Member-Markierungen + Gruppen-Rahmen + Ausrichten-Leiste */}
        {selNodes.size > 1 && (() => {
          const items = selItems(); const gb = groupBounds(); if (!gb || items.length < 2) return null;
          const many = items.length >= 3;
          return (
            <>
              {items.map((it) => (
                <div key={it.uid} style={{ position: 'absolute', left: it.b.left - 1, top: it.b.top - 1, width: it.b.right - it.b.left + 2, height: it.b.bottom - it.b.top + 2, border: '1.5px solid var(--color-primary)', borderRadius: 4, pointerEvents: 'none', zIndex: 55 }} />
              ))}
              <div
                onPointerDown={groupDown} onPointerMove={groupMove} onPointerUp={groupUp} onClick={(e) => e.stopPropagation()}
                title="Auswahl verschieben"
                style={{ position: 'absolute', left: gb.left, top: gb.top, width: gb.right - gb.left, height: gb.bottom - gb.top, border: '1px dashed var(--color-primary)', background: 'rgba(148,170,255,0.05)', cursor: 'move', zIndex: 56, touchAction: 'none' }}
              />
              <div
                onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
                style={{ position: 'absolute', left: Math.max(2, gb.left), top: Math.max(2, gb.top - 40), zIndex: 66, display: 'flex', alignItems: 'center', gap: 2, padding: '3px 5px', borderRadius: 8, background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
              >
                {alignBtn('align_horizontal_left', 'Links ausrichten', () => alignSelection('left'))}
                {alignBtn('align_horizontal_center', 'Horizontal zentrieren', () => alignSelection('hcenter'))}
                {alignBtn('align_horizontal_right', 'Rechts ausrichten', () => alignSelection('right'))}
                <div style={{ width: 1, height: 16, background: 'var(--color-outline-variant)', margin: '0 2px' }} />
                {alignBtn('align_vertical_top', 'Oben ausrichten', () => alignSelection('top'))}
                {alignBtn('align_vertical_center', 'Vertikal zentrieren', () => alignSelection('vcenter'))}
                {alignBtn('align_vertical_bottom', 'Unten ausrichten', () => alignSelection('bottom'))}
                {many && <div style={{ width: 1, height: 16, background: 'var(--color-outline-variant)', margin: '0 2px' }} />}
                {many && alignBtn('horizontal_distribute', 'Horizontal verteilen', () => distributeSelection('h'))}
                {many && alignBtn('vertical_distribute', 'Vertikal verteilen', () => distributeSelection('v'))}
                <div style={{ width: 1, height: 16, background: 'var(--color-outline-variant)', margin: '0 2px' }} />
                {alignBtn('content_copy', 'Auswahl duplizieren', () => duplicateSelected())}
                {alignBtn('delete', 'Auswahl löschen', () => deleteSelection(), '#f87171')}
              </div>
            </>
          );
        })()}
        </div>
        {/* Zeichnen-Fläche (Pfeil/Text/Marker/Rechteck/X/Freihand) */}
        {annoMode !== 'none' && (
          <div
            onPointerDown={drawPointerDown}
            onPointerMove={drawPointerMove}
            onPointerUp={drawPointerUp}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: scrollRef.current?.scrollWidth ?? '100%',
              height: scrollRef.current?.scrollHeight ?? '100%',
              zIndex: 45, cursor: 'crosshair', touchAction: 'none',
            }}
          />
        )}
        {/* Auswahl-Werkzeug: Vollflächen-Overlay zum Rahmen-Aufziehen */}
        {marqueeMode && (
          <div
            onPointerDown={marqueeDown}
            onPointerMove={marqueeMove}
            onPointerUp={marqueeUp}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: scrollRef.current?.scrollWidth ?? '100%',
              height: scrollRef.current?.scrollHeight ?? '100%',
              zIndex: 58, cursor: 'crosshair', touchAction: 'none',
            }}
          />
        )}
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            background: 'rgba(148,170,255,0.08)',
            border: '2px dashed var(--color-primary)',
            borderRadius: '0.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{ textAlign: 'center', color: 'var(--color-primary)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', display: 'block' }}>upload_file</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 600 }}>
                Dateien hier ablegen
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--color-outline-variant)',
          padding: '0.75rem 2rem',
          display: 'flex', flexDirection: 'column', gap: '0.4rem',
        }}>
          {/* Header: einklappbar (Label + Zähler + Auswahl-Kontrolle) */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: attachmentsOpen ? '0.25rem' : 0 }}>
            <button
              type="button"
              onClick={() => setAttachmentsOpen((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-body)', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-outline)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{attachmentsOpen ? 'expand_more' : 'chevron_right'}</span>
              Anhänge ({attachments.length})
            </button>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {attachmentsOpen && selectedIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                    padding: '0.2rem 0.5rem',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '0.3rem',
                    cursor: 'pointer',
                    color: 'var(--color-error)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>delete</span>
                  Auswahl löschen ({selectedIds.size})
                </button>
              )}
              {attachmentsOpen && (
                <button
                  onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                  title={selectMode ? 'Auswahl beenden' : 'Mehrere auswählen'}
                  style={{
                    display: 'flex', alignItems: 'center',
                    padding: '0.2rem',
                    background: selectMode ? 'rgba(148,170,255,0.15)' : 'transparent',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    color: selectMode ? 'var(--color-primary)' : 'var(--color-outline)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>checklist</span>
                </button>
              )}
            </div>
          </div>

          {attachmentsOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
          {attachments.map((att) => (
            <div
              key={att.id}
              onClick={() => {
                if (selectMode) {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(att.id)) next.delete(att.id); else next.add(att.id);
                    return next;
                  });
                }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                cursor: selectMode ? 'pointer' : 'default',
                padding: '0.1rem 0.25rem',
                borderRadius: '0.2rem',
                background: selectMode && selectedIds.has(att.id) ? 'rgba(148,170,255,0.08)' : 'transparent',
              }}
            >
              {selectMode && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(att.id)}
                  onChange={() => {}}
                  style={{ accentColor: 'var(--color-primary)', width: '14px', height: '14px', flexShrink: 0, cursor: 'pointer' }}
                />
              )}
              <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', flexShrink: 0 }}>
                attach_file
              </span>
              <a
                href={getAttachmentDownloadUrl(att.id)}
                download={att.file_name}
                onClick={(e) => selectMode && e.preventDefault()}
                style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--color-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}
              >
                {att.file_name}
              </a>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--color-outline)', flexShrink: 0 }}>
                {formatBytes(att.file_size)}
              </span>
              {!selectMode && (
                <button
                  onClick={() => handleDeleteAttachment(att.id)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.1rem', display: 'flex', alignItems: 'center', color: 'var(--color-error)', flexShrink: 0 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>delete</span>
                </button>
              )}
            </div>
          ))}
          </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          padding: '0.5rem 2rem',
          borderTop: '1px solid var(--color-outline-variant)',
          display: 'flex',
          gap: '1rem',
          fontSize: '0.75rem',
          color: 'var(--color-on-surface-variant)',
          alignItems: 'center',
        }}
      >
        <span>{editor?.storage.characterCount?.characters() ?? 0} Zeichen</span>
        <span>{editor?.storage.characterCount?.words() ?? 0} Wörter</span>
        <span style={{ marginLeft: 'auto', color: statusColor(saveStatus) }}>
          {statusText(saveStatus)}
        </span>
      </div>

      <TaskSlideOver
        isOpen={taskSlideOverOpen}
        onClose={() => setTaskSlideOverOpen(false)}
        task={null}
        prefill={taskSlideOverPrefill}
        onSave={async (data) => { await createTask(data); }}
        onDelete={async (id) => { await deleteTask(id); }}
      />
    </div>
  );
}

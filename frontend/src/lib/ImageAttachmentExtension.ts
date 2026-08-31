import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageNodeView } from '../components/workbook/ImageNodeView';

// Tiptap-Node „imageAttachment" — Inline-Bild, gespeichert als attachmentId
// (kein Base64). Anzeige über React-NodeView (lädt Blob mit Auth).
export const ImageAttachmentExtension = Node.create({
  name: 'imageAttachment',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (el) => { const v = (el as HTMLElement).getAttribute('data-attachment-id'); return v ? Number(v) : null; },
        renderHTML: (attrs) => (attrs.attachmentId != null ? { 'data-attachment-id': String(attrs.attachmentId) } : {}),
      },
      alt: {
        default: '',
        parseHTML: (el) => (el as HTMLElement).getAttribute('alt') || '',
        renderHTML: (attrs) => (attrs.alt ? { alt: String(attrs.alt) } : {}),
      },
    };
  },

  parseHTML() { return [{ tag: 'img[data-attachment-id]' }]; },
  renderHTML({ HTMLAttributes }) { return ['img', mergeAttributes(HTMLAttributes)]; },
  addNodeView() { return ReactNodeViewRenderer(ImageNodeView); },
});

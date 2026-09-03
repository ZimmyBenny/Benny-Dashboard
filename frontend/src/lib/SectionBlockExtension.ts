import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { SectionBlockView } from '../components/workbook/SectionBlockView';

// Tiptap-Node „sectionBlock" — beschrifteter, klappbarer Bereich innerhalb einer Seite.
// Inhalt (Text/Listen/Bilder) lebt im Node; Titel/Zustand/Gesendet als Attribute.
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    sectionBlock: {
      insertSectionBlock: () => ReturnType;
    };
  }
}

export const SectionBlockExtension = Node.create({
  name: 'sectionBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      title: {
        default: 'Neuer Bereich',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-title') || 'Neuer Bereich',
        renderHTML: (attrs) => ({ 'data-title': String(attrs.title ?? '') }),
      },
      collapsed: {
        default: false,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-collapsed') === 'true',
        renderHTML: (attrs) => ({ 'data-collapsed': attrs.collapsed ? 'true' : 'false' }),
      },
      sentAt: {
        default: null,
        parseHTML: (el) => { const v = (el as HTMLElement).getAttribute('data-sent-at'); return v ? Number(v) : null; },
        renderHTML: (attrs) => (attrs.sentAt != null ? { 'data-sent-at': String(attrs.sentAt) } : {}),
      },
      sentNote: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-sent-note') || null,
        renderHTML: (attrs) => (attrs.sentNote ? { 'data-sent-note': String(attrs.sentNote) } : {}),
      },
    };
  },

  // Handler werden von WorkbookEditor gesetzt (kennt page.id + Upload).
  addStorage() {
    return {
      onExportPdf: null as null | ((sectionIndex: number, title: string) => void),
      onAddImage: null as null | ((files: File[], atPos: number) => void),
    };
  },

  parseHTML() { return [{ tag: 'div[data-section-block]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-section-block': '' }), 0]; },
  addNodeView() { return ReactNodeViewRenderer(SectionBlockView); },

  addCommands() {
    return {
      insertSectionBlock: () => ({ commands }) =>
        commands.insertContent({ type: 'sectionBlock', attrs: { title: 'Neuer Bereich' }, content: [{ type: 'paragraph' }] }),
    };
  },
});

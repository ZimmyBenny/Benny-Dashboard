import { Node, mergeAttributes } from '@tiptap/core';

export interface EmailCardAttrs {
  subject: string;
  from: string;
  date: string;
  preview: string;
  attachmentId: number | null;
  fileName: string;
}

/**
 * TipTap Node "emailCard" — rendert eine kompakte E-Mail-Vorschau-Card
 * direkt im Editor-Inhalt.
 *
 * Inline styles; keine Tailwind-Klassen.
 */
export const EmailCardExtension = Node.create<Record<string, never>>({
  name: 'emailCard',

  group: 'block',
  atom: true, // nicht editierbar von innen
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      subject:      { default: '' },
      from:         { default: '' },
      date:         { default: '' },
      preview:      { default: '' },
      attachmentId: { default: null },
      fileName:     { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="email-card"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'email-card' }),
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const attrs = node.attrs as EmailCardAttrs;

      // Äusserer Container
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-type', 'email-card');
      wrapper.style.cssText = [
        'display: flex',
        'align-items: flex-start',
        'gap: 0.75rem',
        'padding: 0.75rem 1rem',
        'margin: 0.5rem 0',
        'background: var(--color-surface-container, rgba(255,255,255,0.04))',
        'border: 1px solid var(--color-outline-variant, rgba(255,255,255,0.12))',
        'border-left: 3px solid var(--color-primary, #cc97ff)',
        'border-radius: 0.5rem',
        'cursor: default',
        'user-select: none',
        'position: relative',
      ].join(';');

      // Mail-Icon
      const icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.textContent = 'mail';
      icon.style.cssText = [
        'font-size: 1.4rem',
        'color: var(--color-primary, #cc97ff)',
        'flex-shrink: 0',
        'margin-top: 0.1rem',
      ].join(';');
      wrapper.appendChild(icon);

      // Inhalts-Bereich
      const content = document.createElement('div');
      content.style.cssText = 'flex: 1; min-width: 0;';

      const subject = document.createElement('div');
      subject.style.cssText = [
        'font-family: var(--font-headline, sans-serif)',
        'font-weight: 700',
        'font-size: 0.9rem',
        'color: var(--color-on-surface, #f5f0ff)',
        'white-space: nowrap',
        'overflow: hidden',
        'text-overflow: ellipsis',
        'margin-bottom: 0.2rem',
      ].join(';');
      subject.textContent = attrs.subject || '(kein Betreff)';

      const meta = document.createElement('div');
      meta.style.cssText = [
        'font-family: var(--font-body, sans-serif)',
        'font-size: 0.75rem',
        'color: var(--color-on-surface-variant, rgba(245,240,255,0.6))',
        'margin-bottom: 0.3rem',
        'white-space: nowrap',
        'overflow: hidden',
        'text-overflow: ellipsis',
      ].join(';');
      const fromText = attrs.from ? `Von: ${attrs.from}` : '';
      const dateText = attrs.date ? formatEmailDate(attrs.date) : '';
      meta.textContent = [fromText, dateText].filter(Boolean).join('  ·  ');

      const preview = document.createElement('div');
      preview.style.cssText = [
        'font-family: var(--font-body, sans-serif)',
        'font-size: 0.8rem',
        'color: var(--color-on-surface-variant, rgba(245,240,255,0.5))',
        'display: -webkit-box',
        '-webkit-line-clamp: 2',
        '-webkit-box-orient: vertical',
        'overflow: hidden',
      ].join(';');
      preview.textContent = attrs.preview || '';

      content.appendChild(subject);
      content.appendChild(meta);
      if (attrs.preview) content.appendChild(preview);
      wrapper.appendChild(content);

      // Dateiname-Badge (rechts oben)
      if (attrs.fileName) {
        const badge = document.createElement('div');
        badge.style.cssText = [
          'font-family: var(--font-body, sans-serif)',
          'font-size: 0.68rem',
          'color: var(--color-outline, rgba(255,255,255,0.35))',
          'flex-shrink: 0',
          'align-self: flex-start',
          'margin-top: 0.15rem',
        ].join(';');
        badge.textContent = attrs.fileName;
        wrapper.appendChild(badge);
      }

      // Klick: Löschen-Button zeigen / Mail-App öffnen
      wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!editor.isEditable) return;
        // Node im Editor selektieren
        if (typeof getPos === 'function') {
          editor.commands.setNodeSelection(getPos());
        }
      });

      wrapper.addEventListener('dblclick', (e) => {
        e.preventDefault();
        // Versucht Mail.app via message://-URL zu öffnen (kein message-id → einfach Info)
        const subject2 = attrs.subject;
        window.alert(`E-Mail: ${subject2}\nVon: ${attrs.from}\n\nDie Originaldatei ist als Anhang gespeichert.`);
      });

      return { dom: wrapper };
    };
  },
});

/** Formatiert ein RFC 2822 Datum-String leserlich. */
function formatEmailDate(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return raw;
  }
}

import { useEffect, useState } from 'react';
import { type ResearchCard as Card, type ResearchScope } from '../../../api/amazon.api';
import { useUpdateCard, useDeleteCard, useUploadImage } from '../../../hooks/amazon/useResearch';
import { ResearchCardLinks } from './ResearchCardLinks';
import { ResearchCardAttachments } from './ResearchCardAttachments';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};
const MAX_BYTES = 20 * 1024 * 1024;

export function ResearchCard({ scope, card, dragHandleProps }: {
  scope: ResearchScope; card: Card; dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const update = useUpdateCard(scope);
  const del = useDeleteCard(scope);
  const upload = useUploadImage(scope);
  const [body, setBody] = useState(card.body);
  useEffect(() => { setBody(card.body); }, [card.body]);

  function saveBody() {
    if (body === card.body) return;
    update.mutate({ cardId: card.id, patch: { body } });
  }

  const isGlobal = card.is_global === 1;
  function toggleGlobal() {
    update.mutate({ cardId: card.id, patch: { is_global: isGlobal ? 0 : 1 } });
  }

  // Cmd+V irgendwo in der Karte: Datei/Bild aus der Zwischenablage anhängen
  // (Text-Einfügen in die Notiz bleibt unberührt — wir greifen nur bei Datei-Items ein)
  function onPasteCard(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    let handled = false;
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f && f.size <= MAX_BYTES) { upload.mutate({ cardId: card.id, file: f }); handled = true; }
      }
    }
    if (handled) {
      e.preventDefault();
      // verhindert, dass der globale Hauptbild-Paste-Listener der Detailseite dasselbe Bild abgreift
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
    }
  }

  return (
    <div className="rounded-lg p-3" onPaste={onPasteCard} data-card-paste
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start gap-2">
        <div {...dragHandleProps} className="cursor-grab pt-1" title="Karte verschieben" style={{ color: 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>drag_indicator</span>
        </div>
        <div className="flex-1 min-w-0">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={saveBody}
            placeholder={'Notiz, Bulletpoints, Keywords …\n• …'} rows={3}
            className="w-full px-2 py-1 rounded text-sm resize-y" style={INPUT_STYLE} />
          <ResearchCardLinks scope={scope} cardId={card.id} links={card.links} />
          <ResearchCardAttachments scope={scope} cardId={card.id} attachments={card.images} />
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {scope !== 'global' && (
            <button type="button" onClick={toggleGlobal}
              aria-label={isGlobal ? 'Global sichtbar' : 'Global schalten'}
              title={isGlobal ? 'Global sichtbar — erscheint auf „Recherche & Wissen"' : 'Global schalten — auch auf „Recherche & Wissen" zeigen'}
              className="p-1 rounded hover:bg-white/5"
              style={{ color: isGlobal ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', opacity: isGlobal ? 1 : 0.6 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: isGlobal ? "'FILL' 1" : "'FILL' 0" }}>language</span>
            </button>
          )}
          <button type="button" onClick={() => { if (confirm('Diese Karte wirklich löschen?')) del.mutate(card.id); }}
            aria-label="Karte löschen" className="p-1 rounded hover:bg-white/5" style={{ color: '#fca5a5' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

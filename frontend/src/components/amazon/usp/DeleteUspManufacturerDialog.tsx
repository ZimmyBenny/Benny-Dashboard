interface Props { manufacturerName: string; onConfirm: () => void; onClose: () => void; }
export function DeleteUspManufacturerDialog({ manufacturerName, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-5 w-[90%] max-w-sm" style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-4" style={{ color: 'var(--color-on-surface)' }}>Hersteller „{manufacturerName || 'ohne Namen'}" und seine Bewertungen werden entfernt.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: '#7f1d1d', color: '#fecaca' }}>Löschen</button>
        </div>
      </div>
    </div>
  );
}

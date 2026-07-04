import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuthStore } from '../../store/authStore';
import {
  fetchMyDataStatus, setMyDataPin, verifyMyDataPin, changeMyDataPin, resetMyDataPin,
  fetchMyData, createMyDataField, updateMyDataField, deleteMyDataField,
  createMyDataGroup, updateMyDataGroup, deleteMyDataGroup,
  type MyDataField, type MyDataGroup,
} from '../../api/amazon.api';
import { exportMyDataPdf } from '../../lib/amazon/exportMyDataPdf';
import { useDraggableModal } from '../../hooks/useDraggableModal';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

function CopyIconBtn({ getText, title }: { getText: () => string; title: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" title={title} onClick={() => {
      const t = getText();
      if (!t.trim()) return;
      navigator.clipboard.writeText(t).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); });
    }} className="p-1 rounded hover:bg-white/5 flex-shrink-0" style={{ color: done ? 'var(--color-secondary)' : 'var(--color-on-surface-variant)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{done ? 'check' : 'content_copy'}</span>
    </button>
  );
}

function FieldRow({ field, onSave, onDelete }: { field: MyDataField; onSave: (patch: { label?: string; value?: string }) => void; onDelete: () => void }) {
  const [label, setLabel] = useState(field.label);
  const [value, setValue] = useState(field.value);
  const [valFocus, setValFocus] = useState(false);
  useEffect(() => { setLabel(field.label); }, [field.label]);
  useEffect(() => { setValue(field.value); }, [field.value]);
  const filled = value.trim() !== '';
  return (
    <div className="group flex items-center gap-2 py-1.5 pl-2 pr-1"
      style={{
        borderLeft: `3px solid ${filled ? 'var(--color-secondary)' : 'rgba(255,255,255,0.08)'}`,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        borderTopLeftRadius: 3,
        borderBottomLeftRadius: 3,
        transition: 'border-color 200ms',
      }}>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => { if (label !== field.label) onSave({ label }); }}
        placeholder="Bezeichnung"
        className="w-44 flex-shrink-0 px-2 py-1 rounded text-sm hover:bg-white/[0.04] focus:bg-white/[0.06] focus:outline-hidden"
        style={{ background: 'transparent', border: 'none', color: 'var(--color-on-surface-variant)' }}
      />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => { setValFocus(false); if (value !== field.value) onSave({ value }); }}
        onFocus={() => setValFocus(true)}
        placeholder="Wert"
        className="flex-1 px-2 py-1 rounded text-sm focus:outline-hidden"
        style={{
          background: 'rgba(9,19,40,0.35)',
          border: `1px solid ${valFocus ? 'rgba(148,170,255,0.5)' : 'rgba(255,255,255,0.08)'}`,
          color: 'var(--color-on-surface)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
        autoComplete="off"
      />
      <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
        <CopyIconBtn title="Feld kopieren (mit Name)" getText={() => field.label ? `${field.label}: ${field.value}` : field.value} />
        <button type="button" onClick={() => { if (confirm(`Feld „${field.label || 'ohne Namen'}" wirklich löschen?`)) onDelete(); }} aria-label="Feld löschen"
          className="p-1 rounded hover:bg-white/5 flex-shrink-0" style={{ color: '#fca5a5' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>
    </div>
  );
}

function GroupSection({ group, fields, onTitle, onDeleteGroup, onAddField, onSaveField, onDeleteField }: {
  group: MyDataGroup; fields: MyDataField[];
  onTitle: (title: string) => void; onDeleteGroup: () => void; onAddField: () => void;
  onSaveField: (id: number, patch: { label?: string; value?: string }) => void; onDeleteField: (id: number) => void;
}) {
  const [title, setTitle] = useState(group.title);
  useEffect(() => { setTitle(group.title); }, [group.title]);
  const groupText = () => {
    const lines = fields.map(f => f.label ? `${f.label}: ${f.value}` : f.value).filter(l => l.trim());
    return [group.title, ...lines].filter(Boolean).join('\n');
  };
  return (
    <section className="rounded-xl p-4 flex flex-col gap-2"
      style={{ background: 'rgba(9,19,40,0.45)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 mb-1">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title !== group.title) onTitle(title); }}
          placeholder="Bereich benennen …"
          className="flex-1 px-2 py-1 rounded text-xs font-semibold tracking-wider uppercase"
          style={{ ...INPUT_STYLE, color: 'var(--color-on-surface-variant)' }} />
        <CopyIconBtn title="Ganze Gruppe kopieren" getText={groupText} />
        <button type="button" onClick={() => { if (confirm(`Bereich „${group.title || 'ohne Namen'}" samt Feldern wirklich löschen?`)) onDeleteGroup(); }}
          aria-label="Bereich löschen" className="p-1 rounded hover:bg-white/5 flex-shrink-0" style={{ color: '#fca5a5' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>
      {fields.map(f => (
        <FieldRow key={f.id} field={f} onSave={(p) => onSaveField(f.id, p)} onDelete={() => onDeleteField(f.id)} />
      ))}
      <button type="button" onClick={onAddField} className="self-start px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Feld
      </button>
    </section>
  );
}

function PinGate({ pinSet, onUnlocked }: { pinSet: boolean; onUnlocked: (token: string) => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [pw, setPw] = useState(''); const [newPin, setNewPin] = useState('');

  async function submit() {
    setErr(null);
    try {
      const r = pinSet ? await verifyMyDataPin(pin) : await setMyDataPin(pin);
      onUnlocked(r.token);
    } catch { setErr(pinSet ? 'Falscher PIN.' : 'PIN muss mind. 4 Zeichen haben.'); }
  }
  async function reset() {
    setErr(null);
    try { const r = await resetMyDataPin(pw, newPin); onUnlocked(r.token); }
    catch { setErr('App-Passwort falsch oder PIN zu kurz.'); }
  }

  return (
    <div className="max-w-sm mx-auto mt-10 rounded-xl p-6 flex flex-col gap-3"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>lock</span>
        <h2 className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>{pinSet ? 'Bereich entsperren' : 'PIN festlegen'}</h2>
      </div>
      {!forgot ? (
        <>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder={pinSet ? 'PIN eingeben' : 'Neuen PIN festlegen (min. 4 Zeichen)'} autoFocus
            className="px-3 py-2 rounded-md text-sm" style={INPUT_STYLE} />
          <button type="button" onClick={submit} className="px-3 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>
            {pinSet ? 'Entsperren' : 'PIN festlegen'}
          </button>
          {pinSet && <button type="button" onClick={() => { setForgot(true); setErr(null); }} className="text-xs self-start"
            style={{ color: 'var(--color-on-surface-variant)' }}>PIN vergessen?</button>}
        </>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Zum Zurücksetzen dein App-Login-Passwort + neuen PIN eingeben.</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="App-Passwort" className="px-3 py-2 rounded-md text-sm" style={INPUT_STYLE} />
          <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="Neuer PIN" className="px-3 py-2 rounded-md text-sm" style={INPUT_STYLE} />
          <button type="button" onClick={reset} className="px-3 py-2 rounded-md text-sm" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>PIN zurücksetzen</button>
          <button type="button" onClick={() => { setForgot(false); setErr(null); }} className="text-xs self-start" style={{ color: 'var(--color-on-surface-variant)' }}>Zurück</button>
        </>
      )}
      {err && <p className="text-xs" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}

function ChangePinBox({ onClose, onChanged }: { onClose: () => void; onChanged: (token: string) => void }) {
  const [oldPin, setOldPin] = useState(''); const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setErr(null);
    try { const r = await changeMyDataPin(oldPin, newPin); onChanged(r.token); }
    catch { setErr('Alter PIN falsch oder neuer PIN zu kurz.'); }
  }
  return (
    <div className="rounded-xl p-4 mb-4 flex items-center gap-2 flex-wrap" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <input type="password" value={oldPin} onChange={(e) => setOldPin(e.target.value)} placeholder="Alter PIN" className="px-2 py-1 rounded text-sm" style={INPUT_STYLE} />
      <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="Neuer PIN" className="px-2 py-1 rounded text-sm" style={INPUT_STYLE} />
      <button type="button" onClick={submit} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Ändern</button>
      <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
      {err && <p className="text-xs w-full" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}

function ExportDialog({
  groups,
  selectedGroupIds,
  onToggle,
  includeEmpty,
  onToggleEmpty,
  onClose,
  onExport,
}: {
  groups: MyDataGroup[];
  selectedGroupIds: number[];
  onToggle: (id: number) => void;
  includeEmpty: boolean;
  onToggleEmpty: () => void;
  onClose: () => void;
  onExport: () => void;
}) {
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 1000 }}>
      <div data-draggable-modal onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(520px,96vw)', maxHeight: '92vh', background: 'var(--color-surface-container)', borderRadius: '1rem', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', ...modalStyle }}>
        {/* Header */}
        <div onMouseDown={onMouseDown} style={{ ...headerStyle, borderBottom: '1px solid var(--color-surface-container-high)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-headline)', fontWeight: 700, color: 'var(--color-on-surface)' }}>Als PDF exportieren</span>
          <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={onClose}
            className="p-1 rounded hover:bg-white/5" style={{ color: 'var(--color-on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem' }}>Bereiche auswählen:</p>
          {groups.slice().sort((a, b) => a.sort_order - b.sort_order).map((g) => (
            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', color: 'var(--color-on-surface)', fontSize: '0.875rem' }}>
              <input type="checkbox" checked={selectedGroupIds.includes(g.id)} onChange={() => onToggle(g.id)} style={{ accentColor: 'var(--color-primary)', width: 16, height: 16 }} />
              {g.title || 'Ohne Titel'}
            </label>
          ))}
          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.08)', margin: '0.75rem 0 0.25rem' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', color: 'var(--color-on-surface)', fontSize: '0.875rem' }}>
            <input type="checkbox" checked={includeEmpty} onChange={onToggleEmpty} style={{ accentColor: 'var(--color-primary)', width: 16, height: 16 }} />
            Leere Felder einschließen
          </label>
          <div style={{ display: 'flex', gap: '0.625rem', marginTop: '1rem' }}>
            <button type="button" onClick={onExport} disabled={selectedGroupIds.length === 0}
              className="px-4 py-2 rounded-md text-sm font-medium"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)', opacity: selectedGroupIds.length === 0 ? 0.5 : 1, flex: 1 }}>
              Als PDF exportieren
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-md text-sm"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AmazonMyDataPage() {
  const qc = useQueryClient();
  const pinGateToken = useAuthStore((s) => s.pinGateToken);
  const setPinGateToken = useAuthStore((s) => s.setPinGateToken);
  const status = useQuery({ queryKey: ['mydata', 'status'], queryFn: fetchMyDataStatus });
  const data = useQuery({ queryKey: ['mydata', 'data'], queryFn: fetchMyData, enabled: !!pinGateToken });

  const inval = () => qc.invalidateQueries({ queryKey: ['mydata', 'data'] });
  const addField = useMutation({ mutationFn: (groupId: number) => createMyDataField(groupId), onSettled: inval });
  const patchField = useMutation({ mutationFn: (v: { id: number; patch: { label?: string; value?: string } }) => updateMyDataField(v.id, v.patch), onSettled: inval });
  const delField = useMutation({ mutationFn: (id: number) => deleteMyDataField(id), onSettled: inval });
  const addGroup = useMutation({ mutationFn: () => createMyDataGroup(), onSettled: inval });
  const patchGroup = useMutation({ mutationFn: (v: { id: number; title: string }) => updateMyDataGroup(v.id, v.title), onSettled: inval });
  const delGroup = useMutation({ mutationFn: (id: number) => deleteMyDataGroup(id), onSettled: inval });
  const [changingPin, setChangingPin] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);
  const [includeEmpty, setIncludeEmpty] = useState(false);

  function lock() { setPinGateToken(null); qc.removeQueries({ queryKey: ['mydata', 'data'] }); }

  function openExportDialog() {
    setSelectedGroupIds(groups.map((g) => g.id));
    setIncludeEmpty(false);
    setShowExportDialog(true);
  }

  async function handleExport() {
    (document.activeElement as HTMLElement | null)?.blur();
    await new Promise((r) => setTimeout(r, 350));
    const fresh = await qc.fetchQuery({ queryKey: ['mydata', 'data'], queryFn: fetchMyData });
    exportMyDataPdf({ groups: fresh.groups, fields: fresh.fields, selectedGroupIds, includeEmpty });
    setShowExportDialog(false);
  }

  if (status.isLoading) return <PageWrapper><p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p></PageWrapper>;

  if (!pinGateToken) {
    return <PageWrapper><PinGate pinSet={!!status.data?.pinSet} onUnlocked={(t) => { setPinGateToken(t); qc.invalidateQueries({ queryKey: ['mydata'] }); }} /></PageWrapper>;
  }

  const groups = data.data?.groups ?? [];
  const fields = data.data?.fields ?? [];
  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Meine Daten</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={openExportDialog} className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>Export</button>
          <button type="button" onClick={() => setChangingPin(v => !v)} className="px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>PIN ändern</button>
          <button type="button" onClick={lock} className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock</span>Sperren</button>
        </div>
      </div>

      {changingPin && <ChangePinBox onClose={() => setChangingPin(false)} onChanged={(t) => { setPinGateToken(t); setChangingPin(false); }} />}

      {data.isLoading ? <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Daten …</p> : (
        <div className="flex flex-col gap-5">
          {groups.map(g => (
            <GroupSection key={g.id} group={g} fields={fields.filter(f => f.group_id === g.id)}
              onTitle={(title) => patchGroup.mutate({ id: g.id, title })}
              onDeleteGroup={() => delGroup.mutate(g.id)}
              onAddField={() => addField.mutate(g.id)}
              onSaveField={(id, patch) => patchField.mutate({ id, patch })}
              onDeleteField={(id) => delField.mutate(id)} />
          ))}
          <button type="button" onClick={() => addGroup.mutate()} className="self-start px-4 py-2 rounded-md text-sm flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>create_new_folder</span> Bereich hinzufügen
          </button>
        </div>
      )}
      {showExportDialog && (
        <ExportDialog
          groups={groups}
          selectedGroupIds={selectedGroupIds}
          onToggle={(id) => setSelectedGroupIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])}
          includeEmpty={includeEmpty}
          onToggleEmpty={() => setIncludeEmpty((v) => !v)}
          onClose={() => setShowExportDialog(false)}
          onExport={handleExport}
        />
      )}
    </PageWrapper>
  );
}

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuthStore } from '../../store/authStore';
import {
  fetchMyDataStatus, setMyDataPin, verifyMyDataPin, changeMyDataPin, resetMyDataPin,
  fetchMyData, createMyDataField, updateMyDataField, deleteMyDataField,
  type MyDataField,
} from '../../api/amazon.api';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

const GROUPS: { key: string; title: string }[] = [
  { key: 'steuer', title: 'Steuer & Zoll' },
  { key: 'bank', title: 'Bankverbindung' },
  { key: 'firma', title: 'Firma & Kontakt' },
  { key: 'amazon', title: 'Amazon-Konto' },
  { key: 'weitere', title: 'Weitere' },
];

function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button type="button" title="Kopieren" onClick={() => { navigator.clipboard.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}
      className="p-1 rounded hover:bg-white/5 flex-shrink-0" style={{ color: done ? 'var(--color-secondary)' : 'var(--color-on-surface-variant)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{done ? 'check' : 'content_copy'}</span>
    </button>
  );
}

function FieldRow({ field, onSave, onDelete }: { field: MyDataField; onSave: (patch: { label?: string; value?: string }) => void; onDelete: () => void }) {
  const [label, setLabel] = useState(field.label);
  const [value, setValue] = useState(field.value);
  useEffect(() => { setLabel(field.label); }, [field.label]);
  useEffect(() => { setValue(field.value); }, [field.value]);
  return (
    <div className="flex items-center gap-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => { if (label !== field.label) onSave({ label }); }}
        placeholder="Bezeichnung" className="w-44 flex-shrink-0 px-2 py-1 rounded text-sm" style={{ ...INPUT_STYLE, color: 'var(--color-on-surface-variant)' }} />
      <input value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => { if (value !== field.value) onSave({ value }); }}
        placeholder="Wert" className="flex-1 px-2 py-1 rounded text-sm" style={INPUT_STYLE} autoComplete="off" />
      <CopyBtn value={field.value} />
      <button type="button" onClick={() => { if (confirm(`Feld „${field.label || 'ohne Namen'}" wirklich löschen?`)) onDelete(); }} aria-label="Feld löschen"
        className="p-1 rounded hover:bg-white/5 flex-shrink-0" style={{ color: '#fca5a5' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
      </button>
    </div>
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

export function AmazonMyDataPage() {
  const qc = useQueryClient();
  const pinGateToken = useAuthStore((s) => s.pinGateToken);
  const setPinGateToken = useAuthStore((s) => s.setPinGateToken);
  const status = useQuery({ queryKey: ['mydata', 'status'], queryFn: fetchMyDataStatus });
  const data = useQuery({ queryKey: ['mydata', 'data'], queryFn: fetchMyData, enabled: !!pinGateToken });

  const inval = () => qc.invalidateQueries({ queryKey: ['mydata', 'data'] });
  const addField = useMutation({ mutationFn: (groupKey: string) => createMyDataField(groupKey), onSettled: inval });
  const patchField = useMutation({ mutationFn: (v: { id: number; patch: { label?: string; value?: string } }) => updateMyDataField(v.id, v.patch), onSettled: inval });
  const delField = useMutation({ mutationFn: (id: number) => deleteMyDataField(id), onSettled: inval });
  const [changingPin, setChangingPin] = useState(false);

  function lock() { setPinGateToken(null); qc.removeQueries({ queryKey: ['mydata', 'data'] }); }

  if (status.isLoading) return <PageWrapper><p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p></PageWrapper>;

  if (!pinGateToken) {
    return <PageWrapper><PinGate pinSet={!!status.data?.pinSet} onUnlocked={(t) => { setPinGateToken(t); qc.invalidateQueries({ queryKey: ['mydata'] }); }} /></PageWrapper>;
  }

  const fields = data.data?.fields ?? [];
  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Meine Daten</h1>
        <div className="flex items-center gap-2">
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
          {GROUPS.map(g => {
            const groupFields = fields.filter(f => f.group_key === g.key);
            return (
              <section key={g.key} className="rounded-xl p-4 flex flex-col gap-2"
                style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs font-semibold tracking-wider" style={{ color: 'var(--color-on-surface-variant)' }}>{g.title.toUpperCase()}</p>
                {groupFields.map(f => (
                  <FieldRow key={f.id} field={f}
                    onSave={(p) => patchField.mutate({ id: f.id, patch: p })}
                    onDelete={() => delField.mutate(f.id)} />
                ))}
                <button type="button" onClick={() => addField.mutate(g.key)} className="self-start px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Feld
                </button>
              </section>
            );
          })}
        </div>
      )}
    </PageWrapper>
  );
}

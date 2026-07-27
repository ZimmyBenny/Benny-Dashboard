import { useEffect, useState, useRef } from 'react';

// ── Optionslisten (verbindliche Offset-Konvention, siehe Spec) ────────────────

export const ALARM_OPTIONS_TIMED = [
  { value: 0,      label: 'Zum Zeitpunkt des Termins' },
  { value: -5,     label: '5 Minuten vorher' },
  { value: -10,    label: '10 Minuten vorher' },
  { value: -15,    label: '15 Minuten vorher' },
  { value: -30,    label: '30 Minuten vorher' },
  { value: -60,    label: '1 Stunde vorher' },
  { value: -120,   label: '2 Stunden vorher' },
  { value: -1440,  label: '1 Tag vorher' },
  { value: -2880,  label: '2 Tage vorher' },
  { value: -10080, label: '1 Woche vorher' },
];

export const ALARM_OPTIONS_ALLDAY = [
  { value: 540,   label: 'Am Tag des Termins (9:00)' },
  { value: -900,  label: '1 Tag vorher (9:00)' },
  { value: -2340, label: '2 Tage vorher (9:00)' },
  { value: -9540, label: '1 Woche vorher (9:00)' },
];

const CUSTOM_SENTINEL = 'custom';
const MAX_ALARMS = 10;

type CustomUnit = 'min' | 'hour' | 'day';
type CustomDirection = 'vorher' | 'nachher';

interface AlarmRow {
  id: number;
  offset: number;
  custom: boolean;
  customAmount: string;
  customUnit: CustomUnit;
  customDirection: CustomDirection;
}

function decomposeOffset(offset: number): { amount: string; unit: CustomUnit; direction: CustomDirection } {
  const abs = Math.abs(offset);
  const direction: CustomDirection = offset < 0 ? 'vorher' : 'nachher';
  if (abs !== 0 && abs % 1440 === 0) {
    return { amount: String(abs / 1440), unit: 'day', direction };
  }
  if (abs !== 0 && abs % 60 === 0) {
    return { amount: String(abs / 60), unit: 'hour', direction };
  }
  return { amount: String(abs || 1), unit: 'min', direction };
}

function unitFactor(unit: CustomUnit): number {
  return unit === 'day' ? 1440 : unit === 'hour' ? 60 : 1;
}

function computeCustomOffset(amount: string, unit: CustomUnit, direction: CustomDirection): number {
  const n = parseInt(amount, 10);
  const safeN = Number.isFinite(n) && n > 0 ? n : 0;
  return (direction === 'vorher' ? -1 : 1) * safeN * unitFactor(unit);
}

interface AlarmListEditorProps {
  value: number[];
  onChange: (v: number[]) => void;
  isAllDay: boolean;
  resetKey?: string;
  inputStyle?: React.CSSProperties;
}

export function AlarmListEditor({ value, onChange, isAllDay, resetKey, inputStyle }: AlarmListEditorProps) {
  const idCounter = useRef(0);
  const nextId = () => ++idCounter.current;

  const options = isAllDay ? ALARM_OPTIONS_ALLDAY : ALARM_OPTIONS_TIMED;

  const [rows, setRows] = useState<AlarmRow[]>(() =>
    value.map((offset) => {
      const isKnown = options.some((o) => o.value === offset);
      const dec = decomposeOffset(offset);
      return {
        id: nextId(),
        offset,
        custom: !isKnown,
        customAmount: dec.amount,
        customUnit: dec.unit,
        customDirection: dec.direction,
      };
    })
  );

  // Beim Öffnen eines anderen Termins (resetKey wechselt) die Liste aus `value` neu befüllen.
  // Bewusst NICHT von `value` selbst abhängig — sonst Endlosschleife mit onChange.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setRows(
      value.map((offset) => {
        const isKnown = options.some((o) => o.value === offset);
        const dec = decomposeOffset(offset);
        return {
          id: nextId(),
          offset,
          custom: !isKnown,
          customAmount: dec.amount,
          customUnit: dec.unit,
          customDirection: dec.direction,
        };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Ganztägig-Umschaltung: Offsets bleiben erhalten, "custom" wird gegen die neue Liste neu berechnet.
  useEffect(() => {
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        custom: r.custom ? true : !options.some((o) => o.value === r.offset),
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllDay]);

  function commit(next: AlarmRow[]) {
    setRows(next);
    onChange(next.map((r) => r.offset));
  }

  function handleSelectChange(id: number, rawValue: string) {
    if (rawValue === CUSTOM_SENTINEL) {
      commit(
        rows.map((r) => {
          if (r.id !== id) return r;
          const dec = decomposeOffset(r.offset);
          return { ...r, custom: true, customAmount: dec.amount, customUnit: dec.unit, customDirection: dec.direction };
        })
      );
      return;
    }
    const offset = parseInt(rawValue, 10);
    commit(rows.map((r) => (r.id === id ? { ...r, custom: false, offset } : r)));
  }

  function handleCustomFieldChange(id: number, patch: Partial<Pick<AlarmRow, 'customAmount' | 'customUnit' | 'customDirection'>>) {
    commit(
      rows.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...patch };
        merged.offset = computeCustomOffset(merged.customAmount, merged.customUnit, merged.customDirection);
        return merged;
      })
    );
  }

  function handleRemove(id: number) {
    commit(rows.filter((r) => r.id !== id));
  }

  function handleAdd() {
    if (rows.length >= MAX_ALARMS) return;
    const firstOption = options[0];
    commit([
      ...rows,
      {
        id: nextId(),
        offset: firstOption.value,
        custom: false,
        customAmount: '1',
        customUnit: 'min',
        customDirection: 'vorher',
      },
    ]);
  }

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer', flex: 1 };
  const smallInputStyle: React.CSSProperties = { ...inputStyle, width: '70px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows.length === 0 && (
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-outline)' }}>Keine Erinnerung</p>
      )}

      {rows.map((row) => (
        <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              style={selectStyle}
              value={row.custom ? CUSTOM_SENTINEL : String(row.offset)}
              onChange={(e) => handleSelectChange(row.id, e.target.value)}
            >
              {options.map((o) => (
                <option key={o.value} value={String(o.value)}>{o.label}</option>
              ))}
              <option value={CUSTOM_SENTINEL}>Eigene Zeit</option>
            </select>
            <button
              type="button"
              onClick={() => handleRemove(row.id)}
              title="Erinnerung entfernen"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--color-outline)', fontSize: '0.85rem', padding: '0.2rem', flexShrink: 0,
              }}
            >✕</button>
          </div>

          {row.custom && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.25rem' }}>
              <input
                type="number"
                min={1}
                style={smallInputStyle}
                value={row.customAmount}
                onChange={(e) => handleCustomFieldChange(row.id, { customAmount: e.target.value })}
              />
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={row.customUnit}
                onChange={(e) => handleCustomFieldChange(row.id, { customUnit: e.target.value as CustomUnit })}
              >
                <option value="min">Minuten</option>
                <option value="hour">Stunden</option>
                <option value="day">Tage</option>
              </select>
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={row.customDirection}
                onChange={(e) => handleCustomFieldChange(row.id, { customDirection: e.target.value as CustomDirection })}
              >
                <option value="vorher">vorher</option>
                <option value="nachher">nachher</option>
              </select>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={handleAdd}
        disabled={rows.length >= MAX_ALARMS}
        style={{
          alignSelf: 'flex-start', background: 'rgba(255,255,255,0.06)',
          border: '1px solid var(--color-outline-variant)', borderRadius: '0.5rem',
          padding: '0.375rem 0.75rem', color: rows.length >= MAX_ALARMS ? 'var(--color-outline)' : 'var(--color-on-surface)',
          cursor: rows.length >= MAX_ALARMS ? 'not-allowed' : 'pointer', fontSize: '0.78rem',
          opacity: rows.length >= MAX_ALARMS ? 0.5 : 1,
        }}
      >
        + Erinnerung hinzufügen
      </button>
    </div>
  );
}

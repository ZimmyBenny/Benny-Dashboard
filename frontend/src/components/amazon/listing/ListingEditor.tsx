import { useEffect, useRef, useState } from 'react';
import { type ListingFields, type ListingPatch } from '../../../api/amazon.api';
import { useUpdateListing } from '../../../hooks/amazon/useListing';
import { ByteCounter } from './ByteCounter';

const AUTOSAVE_DELAY_MS = 600;

// Feld-Definitionen: Schlüssel, sichtbares Label (echte Umlaute), Byte-Limit
// (undefined = kein hartes Limit, Zähler wird nie rot), mehrzeilig?
type FieldKey = keyof Omit<ListingFields, 'product_id'>;
interface FieldDef { key: FieldKey; label: string; limit?: number; rows: number; placeholder?: string; }

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Titel', limit: 200, rows: 2, placeholder: 'Produkt-Titel …' },
  { key: 'bullet_1', label: 'Bullet 1', limit: 249, rows: 2 },
  { key: 'bullet_2', label: 'Bullet 2', limit: 249, rows: 2 },
  { key: 'bullet_3', label: 'Bullet 3', limit: 249, rows: 2 },
  { key: 'bullet_4', label: 'Bullet 4', limit: 249, rows: 2 },
  { key: 'bullet_5', label: 'Bullet 5', limit: 249, rows: 2 },
  { key: 'description', label: 'Produktbeschreibung', limit: 2000, rows: 8 },
  { key: 'keywords_main', label: 'Haupt-Keywords', rows: 3, placeholder: 'Frei — kein hartes Limit' },
  { key: 'keywords_backend', label: 'Backend Search-Terms', limit: 249, rows: 3 },
];

const FIELD_KEYS = FIELDS.map(f => f.key);

export function ListingEditor({ productId, initial }: { productId: number; initial: ListingFields }) {
  const update = useUpdateListing(productId);

  // Ein Snapshot aller Textfelder als lokaler State (wie ProductNotes).
  const buildState = (src: ListingFields): Record<FieldKey, string> =>
    FIELD_KEYS.reduce((acc, k) => { acc[k] = src[k] ?? ''; return acc; }, {} as Record<FieldKey, string>);

  const [values, setValues] = useState<Record<FieldKey, string>>(() => buildState(initial));
  const lastSavedRef = useRef<Record<FieldKey, string>>(buildState(initial));
  const timerRef = useRef<number | null>(null);

  // Initialwerte nur bei Produkt-Wechsel setzen — nicht bei jedem Refetch,
  // sonst wird der User-Input während des Tippens überschrieben.
  useEffect(() => {
    const s = buildState(initial);
    setValues(s);
    lastSavedRef.current = s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  function persist(key: FieldKey, next: string) {
    if (next === lastSavedRef.current[key]) return;
    lastSavedRef.current = { ...lastSavedRef.current, [key]: next };
    const patch: ListingPatch = { [key]: next };
    update.mutate(patch);
  }

  function onChange(key: FieldKey, next: string) {
    setValues(prev => ({ ...prev, [key]: next }));
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      persist(key, next);
    }, AUTOSAVE_DELAY_MS);
  }

  function onBlur(key: FieldKey) {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    persist(key, values[key]);
  }

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {FIELDS.map(f => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
              {f.label}
            </label>
            <ByteCounter value={values[f.key]} limit={f.limit} />
          </div>
          <textarea
            value={values[f.key]}
            onChange={(e) => onChange(f.key, e.target.value)}
            onBlur={() => onBlur(f.key)}
            rows={f.rows}
            placeholder={f.placeholder}
            spellCheck={false}
            className="w-full rounded-lg px-3 py-2 text-sm resize-y"
            style={{
              background: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.08)',
              fontFamily: 'inherit',
              lineHeight: '1.5',
            }}
          />
        </div>
      ))}
      <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>
        Wird automatisch gespeichert. Umlaute zählen doppelt (UTF-8-Bytes).
      </p>
    </div>
  );
}

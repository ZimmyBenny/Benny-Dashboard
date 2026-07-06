// Byte-Länge in UTF-8 — Umlaute (Ä/Ö/Ü/ä/ö/ü/ß) zählen dadurch doppelt,
// genau wie Amazon die Feld-Limits bewertet.
export function byteLen(v: string): number {
  return new TextEncoder().encode(v).length;
}

export function ByteCounter({ value, limit }: { value: string; limit?: number }) {
  const n = byteLen(value);
  const over = limit != null && n > limit;
  return (
    <span
      className="text-xs tabular-nums"
      style={{ color: over ? '#f87171' : 'var(--color-on-surface-variant)' }}
    >
      {limit != null ? `${n} / ${limit} Bytes` : `${n} Bytes`}
    </span>
  );
}

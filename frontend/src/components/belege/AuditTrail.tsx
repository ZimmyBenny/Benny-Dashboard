/**
 * AuditTrail — zeigt die audit_log-Eintraege eines Belegs (Phase 04 Plan 08).
 *
 * Genutzt in BelegeDetailPage (Sektion "Verlauf").
 *
 * audit_log wird vom Backend (Plan 04-00 audit.service) bei jeder Mutation
 * geschrieben — entity_type='receipt', entity_id, action ('create'|'update'|
 * 'delete'|'mirror_sync'|...), old_value/new_value als JSON-Text-Strings.
 *
 * Diff-Ansicht:
 *  - new_value-JSON wird geparst und Schluessel/Werte tabellarisch angezeigt.
 *  - Bei 'update' werden nur geaenderte Felder dargestellt (old_value-Vergleich).
 *  - Fallback: rohe new_value/old_value als <pre>-Block.
 */
import { useState } from 'react';
import { formatDateTime } from '../../lib/format';

export interface AuditEntry {
  id: number;
  action: string;
  old_value: string | null;
  new_value: string | null;
  actor: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<string, string> = {
  create: 'Angelegt',
  update: 'Aktualisiert',
  delete: 'Gelöscht',
  mirror_sync: 'Sync',
  freigabe: 'Freigegeben',
};

const ACTION_COLOR: Record<string, string> = {
  create: 'var(--color-primary)',
  update: 'var(--color-tertiary)',
  delete: 'var(--color-error)',
  mirror_sync: 'var(--color-on-surface-variant)',
  freigabe: 'var(--color-secondary)',
};

function tryParseJson(s: string | null): Record<string, unknown> | null {
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '–';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function AuditEntryRow({ entry }: { entry: AuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const newObj = tryParseJson(entry.new_value);
  const oldObj = tryParseJson(entry.old_value);
  const label = ACTION_LABEL[entry.action] ?? entry.action;
  const color = ACTION_COLOR[entry.action] ?? 'var(--color-on-surface-variant)';

  // Diff: nur Felder, deren Werte sich geandert haben (oder die neu sind)
  const diffEntries: Array<{ key: string; oldV: unknown; newV: unknown }> = [];
  if (newObj) {
    for (const [k, v] of Object.entries(newObj)) {
      const oldV = oldObj ? oldObj[k] : undefined;
      if (oldObj === null || stringifyValue(oldV) !== stringifyValue(v)) {
        diffEntries.push({ key: k, oldV, newV: v });
      }
    }
  }

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(148,170,255,0.08)',
        padding: '0.75rem 1rem',
        borderRadius: '0.5rem',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: '0.75rem',
          fontSize: '0.8rem',
        }}
      >
        <span
          style={{
            fontWeight: 700,
            color,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {label}
        </span>
        <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.75rem' }}>
          {entry.actor ?? 'system'} · {formatDateTime(entry.created_at)}
        </span>
      </div>

      {diffEntries.length > 0 && (
        <div
          style={{
            marginTop: '0.5rem',
            display: 'grid',
            gridTemplateColumns: '160px 1fr 1fr',
            gap: '0.25rem 0.75rem',
            fontSize: '0.75rem',
            color: 'var(--color-on-surface)',
          }}
        >
          <span style={{ color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Feld</span>
          <span style={{ color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Vorher</span>
          <span style={{ color: 'var(--color-on-surface-variant)', fontWeight: 600 }}>Nachher</span>
          {diffEntries.slice(0, expanded ? diffEntries.length : 5).map((d) => (
            <>
              <span key={`${d.key}-k`} style={{ fontFamily: 'monospace', color: 'var(--color-on-surface-variant)' }}>
                {d.key}
              </span>
              <span
                key={`${d.key}-o`}
                style={{ color: 'var(--color-on-surface-variant)', wordBreak: 'break-word' }}
              >
                {stringifyValue(d.oldV)}
              </span>
              <span key={`${d.key}-n`} style={{ color: 'var(--color-on-surface)', wordBreak: 'break-word' }}>
                {stringifyValue(d.newV)}
              </span>
            </>
          ))}
          {diffEntries.length > 5 && (
            <button
              type="button"
              onClick={() => setExpanded((x) => !x)}
              style={{
                gridColumn: '1 / -1',
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                textAlign: 'left',
                padding: '0.25rem 0',
              }}
            >
              {expanded ? 'weniger anzeigen' : `… ${diffEntries.length - 5} weitere`}
            </button>
          )}
        </div>
      )}

      {!newObj && entry.new_value && (
        <pre
          style={{
            marginTop: '0.5rem',
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            color: 'var(--color-on-surface-variant)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {entry.new_value}
        </pre>
      )}
    </div>
  );
}

export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  if (!entries || entries.length === 0) {
    return (
      <p
        style={{
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.85rem',
          margin: 0,
        }}
      >
        Keine Verlaufseinträge.
      </p>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {entries.map((e) => (
        <AuditEntryRow key={e.id} entry={e} />
      ))}
    </div>
  );
}

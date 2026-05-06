/**
 * BelegeDetailPage — /belege/:id (Phase 04 Plan 08).
 *
 * Split-Layout:
 *  - Linke Spalte: PdfPreview (Inline-PDF/Bild-Vorschau)
 *  - Rechte Spalte: Daten in Sektionen (Grunddaten, Beträge, Steuer,
 *    Zuordnung, OCR, Verlauf, Aktionen)
 *
 * GoBD-Lock-Verhalten:
 *  - freigegeben_at != null → finanzrelevante Felder sind disabled
 *    (supplier_name, supplier_invoice_number, receipt_date, vat_rate,
 *    amount_*, type, file_hash, private_share_percent — siehe Migration 040
 *    trg_receipts_no_update_after_freigabe)
 *  - notes/tags/payment_date/due_date bleiben editierbar (kein Trigger)
 *  - Aenderungen finanzrelevanter Felder nur via Korrekturbeleg
 *
 * Aktionen:
 *  - "Freigeben" (nur wenn !isLocked) → setzt GoBD-Lock
 *  - "Korrekturbeleg" (immer sichtbar; bei nicht-freigegeben mit Hinweis)
 *  - Polling alle 2s solange status='ocr_pending' (Auto-Refresh)
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatusBadge } from '../../components/dj/StatusBadge';
import { PdfPreview } from '../../components/belege/PdfPreview';
import { AuditTrail } from '../../components/belege/AuditTrail';
import {
  fetchReceipt,
  updateReceipt,
  freigebenReceipt,
  deleteReceipt,
  type ReceiptDetail,
} from '../../api/belege.api';
import apiClient from '../../api/client';
import { formatCurrencyFromCents, formatDate } from '../../lib/format';

export function BelegeDetailPage() {
  const { id: idStr } = useParams<{ id: string }>();
  const id = Number(idStr);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: r, isLoading, error } = useQuery({
    queryKey: ['belege', id],
    queryFn: () => fetchReceipt(id),
    enabled: Number.isFinite(id) && id > 0,
    refetchInterval: (query) => {
      const data = query.state.data as ReceiptDetail | undefined;
      return data?.status === 'ocr_pending' ? 2000 : false;
    },
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<ReceiptDetail>) => updateReceipt(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['belege', id] }),
  });

  const freigebenMut = useMutation({
    mutationFn: () => freigebenReceipt(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['belege', id] });
      qc.invalidateQueries({ queryKey: ['belege'] });
    },
  });

  const korrekturMut = useMutation({
    mutationFn: () =>
      apiClient
        .post(`/belege/${id}/korrektur`)
        .then((res) => res.data as { id: number }),
    onSuccess: (newReceipt) => {
      qc.invalidateQueries({ queryKey: ['belege'] });
      navigate(`/belege/${newReceipt.id}`);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteReceipt(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['belege'] });
      navigate('/belege/alle');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string };
      const msg = e?.response?.data?.error ?? e?.message ?? 'Loeschen fehlgeschlagen';
      window.alert(msg);
    },
  });

  if (!Number.isFinite(id) || id <= 0) {
    return (
      <PageWrapper>
        <p style={{ padding: '2rem', color: 'var(--color-error)' }}>Ungültige Beleg-ID.</p>
      </PageWrapper>
    );
  }

  if (isLoading) {
    return (
      <PageWrapper>
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.4 }}>
            hourglass_empty
          </span>
          Lade Beleg…
        </div>
      </PageWrapper>
    );
  }

  if (error || !r) {
    return (
      <PageWrapper>
        <p style={{ padding: '2rem', color: 'var(--color-error)' }}>
          Beleg konnte nicht geladen werden.{' '}
          <button
            type="button"
            onClick={() => navigate('/belege/alle')}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Zurück zur Liste
          </button>
        </p>
      </PageWrapper>
    );
  }

  const isLocked = !!r.freigegeben_at;
  const primaryFile = r.files[0];
  const fileUrl = primaryFile ? `/api/belege/${id}/file/${primaryFile.id}` : null;

  // Reverse-Charge wird im Schema als reverse_charge (0|1) gefuehrt — Plan-Snippet
  // hatte einen heuristischen Vergleich; wir lesen direkt die Spalte.
  const reverseCharge = (r as ReceiptDetail & { reverse_charge?: number }).reverse_charge === 1;
  const taxCategory = (r as ReceiptDetail & { tax_category?: string | null }).tax_category ?? null;
  const inputTaxDeductible =
    (r as ReceiptDetail & { input_tax_deductible?: number }).input_tax_deductible !== 0;

  const onChangeNotes = (val: string) => updateMut.mutate({ notes: val });

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2.5rem 2rem', position: 'relative' }}>
        {/* Ambient glows (DJ-Stil) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '600px',
            height: '600px',
            background: 'radial-gradient(circle at top right, rgba(148,170,255,0.06) 0%, transparent 60%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
            <div>
              <button
                type="button"
                onClick={() => navigate(-1)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-on-surface-variant)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontFamily: 'var(--font-body)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  marginBottom: '0.5rem',
                  padding: 0,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>arrow_back</span>
                Zurück
              </button>
              <h1
                style={{
                  fontFamily: 'Manrope, sans-serif',
                  fontWeight: 800,
                  fontSize: '2.25rem',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-primary)',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                Beleg #{r.id}
              </h1>
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', margin: '0.25rem 0 0', fontFamily: 'var(--font-body)' }}>
                {r.title || r.supplier_name || 'Ohne Titel'} · {formatDate(r.receipt_date)}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <StatusBadge status={r.status as never} />
              {isLocked && (
                <span
                  title={`Freigegeben am ${formatDate(r.freigegeben_at)}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    color: 'var(--color-secondary)',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>lock</span>
                  Freigegeben
                </span>
              )}
            </div>
          </div>

          {/* Split-Layout */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
              gap: '1.5rem',
              alignItems: 'start',
            }}
          >
            {/* Linke Spalte: PDF/Bild-Preview */}
            <div style={{ position: 'sticky', top: '1rem' }}>
              {fileUrl && primaryFile ? (
                <PdfPreview url={fileUrl} mimeType={primaryFile.mime_type} />
              ) : (
                <div
                  style={{
                    background: 'var(--color-surface-variant)',
                    borderRadius: '0.75rem',
                    padding: '3rem 1.5rem',
                    textAlign: 'center',
                    color: 'var(--color-on-surface-variant)',
                    fontFamily: 'var(--font-body)',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem', opacity: 0.4 }}>
                    description
                  </span>
                  Keine Datei verknüpft.
                </div>
              )}
              {r.files.length > 1 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', marginTop: '0.5rem', fontFamily: 'var(--font-body)' }}>
                  {r.files.length} Dateien angehängt — weitere unter
                  {r.files.slice(1).map((f, i) => (
                    <span key={f.id}>
                      {' '}
                      <a
                        href={`/api/belege/${id}/file/${f.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                      >
                        {f.original_filename}
                      </a>
                      {i < r.files.length - 2 ? ',' : ''}
                    </span>
                  ))}
                </p>
              )}
            </div>

            {/* Rechte Spalte: Daten-Sektionen */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
              <Section title="Grunddaten">
                <Field
                  label="Lieferant"
                  value={r.supplier_name ?? ''}
                  disabled={isLocked}
                  onChange={(v) => updateMut.mutate({ supplier_name: v || null })}
                />
                <Field
                  label="Belegnummer"
                  value={r.supplier_invoice_number ?? r.receipt_number ?? ''}
                  disabled={isLocked}
                  onChange={(v) => updateMut.mutate({ supplier_invoice_number: v || null })}
                />
                <Field
                  label="Belegdatum"
                  value={r.receipt_date}
                  disabled={isLocked}
                  type="date"
                  onChange={(v) => updateMut.mutate({ receipt_date: v })}
                />
                <Field
                  label="Fällig am"
                  value={r.due_date ?? ''}
                  type="date"
                  onChange={(v) => updateMut.mutate({ due_date: v || null })}
                />
                <Field
                  label="Bezahlt am"
                  value={r.payment_date ?? ''}
                  type="date"
                  onChange={(v) => updateMut.mutate({ payment_date: v || null })}
                />
                <Field label="Typ" value={r.type} disabled />
                <Field label="Quelle" value={r.source} disabled />
              </Section>

              <Section title="Beträge">
                <Field label="Brutto" value={formatCurrencyFromCents(r.amount_gross_cents)} disabled />
                <Field label="Netto" value={formatCurrencyFromCents(r.amount_net_cents)} disabled />
                <Field
                  label="USt"
                  value={`${r.vat_rate}% = ${formatCurrencyFromCents(r.vat_amount_cents)}`}
                  disabled
                />
                <Field
                  label="Bezahlt"
                  value={formatCurrencyFromCents(
                    (r as ReceiptDetail & { paid_amount_cents?: number }).paid_amount_cents ?? 0,
                  )}
                  disabled
                />
              </Section>

              <Section title="Steuer">
                <Field label="Reverse Charge" value={reverseCharge ? 'ja (§13b UStG)' : 'nein'} disabled />
                <Field label="Vorsteuer abziehbar" value={inputTaxDeductible ? 'ja' : 'nein'} disabled />
                <Field label="Steuerkategorie" value={taxCategory ?? '–'} disabled />
                <Field
                  label="Steuerrelevant"
                  value={
                    (r as ReceiptDetail & { steuerrelevant?: number }).steuerrelevant === 0 ? 'nein' : 'ja'
                  }
                  disabled
                />
              </Section>

              <Section title="Zuordnung">
                <Field
                  label="Bereiche"
                  value={
                    r.area_links.length > 0
                      ? r.area_links
                          .map((a) => `${a.area_name}${a.is_primary ? ' (primär)' : ''}`)
                          .join(', ')
                      : '–'
                  }
                  disabled
                />
                {r.linked_invoice_id && (
                  <Field label="DJ-Rechnung" value={`#${r.linked_invoice_id}`} disabled />
                )}
                {r.linked_trip_id && (
                  <Field label="Fahrt" value={`#${r.linked_trip_id}`} disabled />
                )}
                {(r as ReceiptDetail & { corrects_receipt_id?: number | null }).corrects_receipt_id && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-tertiary)', fontFamily: 'var(--font-body)', margin: '0.25rem 0' }}>
                    Korrekturbeleg zu #{(r as ReceiptDetail & { corrects_receipt_id?: number | null }).corrects_receipt_id}
                  </p>
                )}
                {(r as ReceiptDetail & { corrected_by_receipt_id?: number | null }).corrected_by_receipt_id && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-tertiary)', fontFamily: 'var(--font-body)', margin: '0.25rem 0' }}>
                    Korrigiert durch #{(r as ReceiptDetail & { corrected_by_receipt_id?: number | null }).corrected_by_receipt_id}
                  </p>
                )}
              </Section>

              <Section title="Notizen">
                <NotesField initialValue={r.notes ?? ''} onSave={onChangeNotes} />
              </Section>

              <Section title="OCR-Ergebnis">
                {r.ocr_results.length === 0 ? (
                  <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.85rem', margin: 0, fontFamily: 'var(--font-body)' }}>
                    Kein OCR-Ergebnis vorhanden.
                  </p>
                ) : (
                  r.ocr_results.map((o) => (
                    <div key={o.id} style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                      <p style={{ margin: '0.25rem 0', color: 'var(--color-on-surface-variant)' }}>
                        Engine: <span style={{ color: 'var(--color-on-surface)' }}>{o.engine}</span>
                        {' · '}
                        Confidence:{' '}
                        <span style={{ color: 'var(--color-on-surface)' }}>
                          {o.overall_confidence != null ? `${Math.round(o.overall_confidence)}%` : '–'}
                        </span>
                      </p>
                      <details>
                        <summary style={{ cursor: 'pointer', color: 'var(--color-primary)', fontSize: '0.8rem' }}>
                          Volltext anzeigen
                        </summary>
                        <pre
                          style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: '0.75rem',
                            background: 'rgba(0,0,0,0.2)',
                            padding: '0.75rem',
                            borderRadius: '0.375rem',
                            marginTop: '0.5rem',
                            color: 'var(--color-on-surface-variant)',
                            maxHeight: '300px',
                            overflowY: 'auto',
                          }}
                        >
                          {o.full_text}
                        </pre>
                      </details>
                    </div>
                  ))
                )}
              </Section>

              <Section title="Aktionen">
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Beleg freigeben? Danach sind finanzrelevante Felder gesperrt — Änderungen nur noch via Korrekturbeleg möglich.',
                          )
                        ) {
                          freigebenMut.mutate();
                        }
                      }}
                      disabled={freigebenMut.isPending}
                      style={{
                        background: 'linear-gradient(135deg, #5cfd80 0%, #94aaff 100%)',
                        color: '#060e20',
                        border: 'none',
                        borderRadius: '0.5rem',
                        padding: '0.625rem 1.25rem',
                        fontSize: '0.875rem',
                        fontFamily: 'Manrope, sans-serif',
                        fontWeight: 700,
                        cursor: freigebenMut.isPending ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        opacity: freigebenMut.isPending ? 0.6 : 1,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>check_circle</span>
                      Geprüft / Freigeben
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          'Korrekturbeleg erstellen? Es wird ein neuer Beleg mit negativen Beträgen angelegt, der diesen Beleg storniert.',
                        )
                      ) {
                        korrekturMut.mutate();
                      }
                    }}
                    disabled={korrekturMut.isPending}
                    style={{
                      background: 'rgba(255,200,80,0.15)',
                      color: '#ffd166',
                      border: '1px solid #ffd166',
                      borderRadius: '0.5rem',
                      padding: '0.625rem 1.25rem',
                      fontSize: '0.875rem',
                      fontFamily: 'Manrope, sans-serif',
                      fontWeight: 600,
                      cursor: korrekturMut.isPending ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      opacity: korrekturMut.isPending ? 0.6 : 1,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>undo</span>
                    Korrekturbeleg
                  </button>
                  {!isLocked && r.status !== 'archiviert' && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Beleg archivieren? (Status auf "archiviert" setzen)')) {
                          updateMut.mutate({ status: 'archiviert' });
                        }
                      }}
                      disabled={updateMut.isPending}
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        color: 'var(--color-on-surface-variant)',
                        border: '1px solid rgba(148,170,255,0.2)',
                        borderRadius: '0.5rem',
                        padding: '0.625rem 1.25rem',
                        fontSize: '0.875rem',
                        fontFamily: 'var(--font-body)',
                        cursor: updateMut.isPending ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>archive</span>
                      Archivieren
                    </button>
                  )}
                  {!isLocked && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            'Beleg endgültig löschen? Datei wird ebenfalls aus dem Storage entfernt. Diese Aktion ist nicht umkehrbar.',
                          )
                        ) {
                          deleteMut.mutate();
                        }
                      }}
                      disabled={deleteMut.isPending}
                      style={{
                        background: 'rgba(255, 100, 100, 0.08)',
                        color: 'var(--color-error)',
                        border: '1px solid rgba(255, 100, 100, 0.3)',
                        borderRadius: '0.5rem',
                        padding: '0.625rem 1.25rem',
                        fontSize: '0.875rem',
                        fontFamily: 'var(--font-body)',
                        cursor: deleteMut.isPending ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        opacity: deleteMut.isPending ? 0.6 : 1,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>delete</span>
                      Löschen
                    </button>
                  )}
                </div>
                {isLocked && (
                  <p
                    style={{
                      marginTop: '0.75rem',
                      fontSize: '0.8rem',
                      color: 'var(--color-on-surface-variant)',
                      fontFamily: 'var(--font-body)',
                      lineHeight: 1.4,
                    }}
                  >
                    Beleg ist freigegeben (GoBD-Lock). Änderungen an Lieferant, Datum, Beträgen oder USt
                    sind nur noch über einen Korrekturbeleg möglich.
                  </p>
                )}
                {korrekturMut.isError && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-error)', fontFamily: 'var(--font-body)' }}>
                    Korrekturbeleg konnte nicht erstellt werden: {(korrekturMut.error as Error).message}
                  </p>
                )}
              </Section>

              <Section title="Verlauf">
                <AuditTrail entries={r.audit_log} />
              </Section>
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Components
// ─────────────────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: 'var(--color-surface-variant)',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        border: '1px solid rgba(148,170,255,0.08)',
      }}
    >
      <h3
        style={{
          fontFamily: 'Manrope, sans-serif',
          fontSize: '0.75rem',
          fontWeight: 700,
          marginTop: 0,
          marginBottom: '0.75rem',
          color: 'var(--color-on-surface-variant)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: string;
  disabled?: boolean;
  type?: 'text' | 'date';
  onChange?: (v: string) => void;
}

function Field({ label, value, disabled, type = 'text', onChange }: FieldProps) {
  const [localValue, setLocalValue] = useState(value);
  const editable = !!onChange && !disabled;

  // Sync with external value changes (e.g. after save)
  if (!editable && localValue !== value) {
    setLocalValue(value);
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: '0.75rem',
        alignItems: 'center',
        padding: '0.25rem 0',
      }}
    >
      <span
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      {editable ? (
        <input
          type={type}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={() => {
            if (localValue !== value) onChange!(localValue);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(148,170,255,0.15)',
            borderRadius: '0.375rem',
            padding: '0.375rem 0.625rem',
            color: 'var(--color-on-surface)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        />
      ) : (
        <span
          style={{
            fontSize: '0.85rem',
            color: 'var(--color-on-surface)',
            fontFamily: 'var(--font-body)',
            wordBreak: 'break-word',
          }}
        >
          {value || '–'}
        </span>
      )}
    </div>
  );
}

function NotesField({ initialValue, onSave }: { initialValue: string; onSave: (v: string) => void }) {
  const [val, setVal] = useState(initialValue);
  return (
    <textarea
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => {
        if (val !== initialValue) onSave(val);
      }}
      placeholder="Freie Notizen zum Beleg…"
      style={{
        width: '100%',
        minHeight: '5rem',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(148,170,255,0.15)',
        borderRadius: '0.5rem',
        padding: '0.625rem 0.75rem',
        color: 'var(--color-on-surface)',
        fontFamily: 'var(--font-body)',
        fontSize: '0.85rem',
        outline: 'none',
        resize: 'vertical',
      }}
    />
  );
}

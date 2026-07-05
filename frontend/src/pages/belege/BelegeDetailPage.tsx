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
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { StatusBadge } from '../../components/dj/StatusBadge';
import { PdfPreview } from '../../components/belege/PdfPreview';
import { BelegLightbox } from '../../components/belege/BelegLightbox';
import { AuditTrail } from '../../components/belege/AuditTrail';
import {
  fetchReceipt,
  fetchReceipts,
  updateReceipt,
  freigebenReceipt,
  deleteReceipt,
  fetchTaxCategories,
  fetchAreas,
  setReceiptAreas,
  fetchBelegeSettings,
  fetchSupplierSuggest,
  type ReceiptDetail,
  type TaxCategory,
  type Area,
} from '../../api/belege.api';
import apiClient from '../../api/client';
import { createContract } from '../../api/contracts.api';
import { ContractPicker } from '../../components/contracts/ContractPicker';
import { formatCurrencyFromCents, formatDate } from '../../lib/format';
import { todayLocal, addDaysLocal } from '../../lib/dates';

export function BelegeDetailPage() {
  const { id: idStr } = useParams<{ id: string }>();
  const id = Number(idStr);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [suggestTriedFor, setSuggestTriedFor] = useState<string | null>(null);
  const [showPaidConfirm, setShowPaidConfirm] = useState(false);
  const [paidDate, setPaidDate] = useState('');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [showNewContractPanel, setShowNewContractPanel] = useState(false);

  const { data: r, isLoading, error } = useQuery({
    queryKey: ['belege', id],
    queryFn: () => fetchReceipt(id),
    enabled: Number.isFinite(id) && id > 0,
    refetchInterval: (query) => {
      const data = query.state.data as ReceiptDetail | undefined;
      return data?.status === 'ocr_pending' ? 2000 : false;
    },
  });

  // Prüf-Liste (noch nicht freigegebene Belege) für Vor/Zurück im Detail — gleicher
  // Query-Key wie die Zu-prüfen-Seite, wird also aus dem Cache geteilt.
  const { data: reviewList = [] } = useQuery({
    queryKey: ['belege', 'review', 'pending'],
    queryFn: () => fetchReceipts({ pending: '1' }),
    staleTime: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: (data: Partial<ReceiptDetail>) => updateReceipt(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['belege', id] }),
  });

  const freigebenMut = useMutation({
    mutationFn: () => freigebenReceipt(id),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['belege', id] });
      qc.invalidateQueries({ queryKey: ['belege'] });
      // Fluessiger Pruef-Durchlauf: nach dem Freigeben automatisch zum naechsten
      // noch offenen Beleg springen (frische pending-Liste, aktuelle id defensiv
      // ausschliessen gegen Cache-Timing). Kein offener mehr -> zurueck zur Liste.
      try {
        const pending = await fetchReceipts({ pending: '1' });
        const next = pending.find((b) => b.id !== id);
        if (next) {
          navigate(`/belege/${next.id}`);
        } else {
          navigate('/belege/zu-pruefen');
        }
      } catch {
        // Liste konnte nicht geladen werden — zurueck zur Uebersicht statt haengen
        navigate('/belege/zu-pruefen');
      }
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
      const msg = e?.response?.data?.error ?? e?.message ?? 'Löschen fehlgeschlagen';
      window.alert(msg);
    },
  });

  // Steuerkategorien fuer den Picker (cached, nur einmal pro Session geladen).
  const { data: taxCategories = [] } = useQuery<TaxCategory[]>({
    queryKey: ['tax-categories'],
    queryFn: fetchTaxCategories,
    staleTime: 5 * 60 * 1000,
  });

  const { data: areas = [] } = useQuery<Area[]>({
    queryKey: ['areas'],
    queryFn: fetchAreas,
    staleTime: 5 * 60 * 1000,
  });

  // Belege-Settings (Cache geteilt mit BelegeSettingsPage via Query-Key
  // 'belege-settings' — Toggle wirkt ohne Page-Reload).
  const { data: belegeSettings } = useQuery<Record<string, string>>({
    queryKey: ['belege-settings'],
    queryFn: fetchBelegeSettings,
  });

  const setAreasMut = useMutation({
    mutationFn: ({ ids, primary }: { ids: number[]; primary?: number }) =>
      setReceiptAreas(id, ids, primary),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['belege', id] }),
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      window.alert(e?.response?.data?.error ?? e?.message ?? 'Bereich-Zuordnung fehlgeschlagen');
    },
  });

  // Supplier-Suggest auch auf der Detail-Page: wenn der User einen Lieferanten
  // manuell eintraegt (oder OCR den Lieferant gesetzt hat, aber area/tax_category
  // noch leer sind), schlagen wir area_id + tax_category_id aus supplier_memory
  // vor. Nur wenn:
  //   - Beleg NICHT freigegeben (GoBD-Lock)
  //   - area_links leer UND tax_category_id null (sonst nicht ueberschreiben)
  //   - supplier noch nicht versucht wurde (Tracker via suggestTriedFor)
  // Spiegelt das Pattern aus BelegeUploadPage.tsx:344-361.
  useEffect(() => {
    if (!r) return;
    if (r.freigegeben_at) return; // Locked: niemals modifizieren
    const supplier = r.supplier_name?.trim();
    if (!supplier) return;
    if (suggestTriedFor === supplier) return;
    const hasArea = (r.area_links?.length ?? 0) > 0;
    const taxCatId = (r as ReceiptDetail & { tax_category_id?: number | null }).tax_category_id ?? null;
    const hasTaxCat = taxCatId !== null;
    if (hasArea && hasTaxCat) return; // beide gesetzt - nichts zu tun

    setSuggestTriedFor(supplier);
    fetchSupplierSuggest(supplier)
      .then((s) => {
        if (!hasArea && s.area_id !== null) {
          setAreasMut.mutate({ ids: [s.area_id], primary: s.area_id });
        }
        if (!hasTaxCat && s.tax_category_id !== null) {
          updateMut.mutate({ tax_category_id: s.tax_category_id } as Partial<ReceiptDetail>);
        }
      })
      .catch(() => {
        // 404 = kein Memory fuer diesen Lieferant - silently skippen
      });
  }, [r, suggestTriedFor, setAreasMut, updateMut]);

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
                onClick={() => navigate('/belege/zu-pruefen')}
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
                  color: 'var(--color-on-surface)',
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
              {(() => {
                const idx = reviewList.findIndex((b) => b.id === r.id);
                if (idx < 0 || reviewList.length < 2) return null;
                const prev = idx > 0 ? reviewList[idx - 1] : null;
                const next = idx < reviewList.length - 1 ? reviewList[idx + 1] : null;
                const btnStyle = (enabled: boolean) => ({
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(148,170,255,0.25)',
                  borderRadius: '0.5rem',
                  padding: '0.3rem',
                  color: 'var(--color-on-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: enabled ? 'pointer' : 'default',
                  opacity: enabled ? 1 : 0.35,
                });
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <button
                      type="button"
                      disabled={!prev}
                      title="Vorheriger Beleg (zu prüfen)"
                      onClick={() => prev && navigate(`/belege/${prev.id}`)}
                      style={btnStyle(!!prev)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_left</span>
                    </button>
                    <span
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--color-on-surface-variant)',
                        fontFamily: 'var(--font-body)',
                        minWidth: '3.25rem',
                        textAlign: 'center',
                      }}
                    >
                      {idx + 1} / {reviewList.length}
                    </span>
                    <button
                      type="button"
                      disabled={!next}
                      title="Nächster Beleg (zu prüfen)"
                      onClick={() => next && navigate(`/belege/${next.id}`)}
                      style={btnStyle(!!next)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>chevron_right</span>
                    </button>
                  </div>
                );
              })()}
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
                <div style={{ position: 'relative', cursor: 'zoom-in' }} onClick={() => setLightboxOpen(true)}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxOpen(true);
                    }}
                    title="Vollbild anzeigen"
                    style={{
                      position: 'absolute',
                      top: '0.75rem',
                      right: '0.75rem',
                      zIndex: 2,
                      background: 'rgba(0,0,0,0.55)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '0.5rem',
                      padding: '0.375rem 0.625rem',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-body)',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>open_in_full</span>
                    Vollbild
                  </button>
                  <PdfPreview url={fileUrl} mimeType={primaryFile.mime_type} />
                </div>
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
                  key={`due-${r.due_date ?? ''}`}
                  label="Fällig am"
                  value={r.due_date ?? ''}
                  type="date"
                  disabled={isLocked || r.type === 'fahrt'}
                  onChange={(v) => updateMut.mutate({ due_date: v || null })}
                />
                <Field
                  key={`pay-${r.payment_date ?? ''}`}
                  label="Bezahlt am"
                  value={r.payment_date ?? ''}
                  type="date"
                  disabled={isLocked || r.type === 'fahrt'}
                  onChange={(v) => updateMut.mutate({ payment_date: v || null })}
                />
                {!isLocked && r.type !== 'fahrt' && r.receipt_date && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 1fr',
                      gap: '0.75rem',
                      alignItems: 'center',
                      padding: '0.25rem 0',
                    }}
                  >
                    <span />
                    <button
                      type="button"
                      onClick={() =>
                        updateMut.mutate({ due_date: r.receipt_date, payment_date: r.receipt_date })
                      }
                      title="Fällig am und Bezahlt am auf das Belegdatum setzen"
                      style={{
                        justifySelf: 'start',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.375rem',
                        background: 'rgba(148,170,255,0.1)',
                        border: '1px solid rgba(148,170,255,0.25)',
                        borderRadius: '0.5rem',
                        padding: '0.35rem 0.7rem',
                        color: 'var(--color-on-surface)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>
                        content_copy
                      </span>
                      Aus Belegdatum übernehmen
                    </button>
                  </div>
                )}
                <Field label="Typ" value={r.type} disabled />
                <Field label="Quelle" value={r.source} disabled />
              </Section>

              <Section title="Beträge">
                <Field
                  label="Brutto"
                  value={formatCentsForInput(r.amount_gross_cents)}
                  disabled={isLocked}
                  type="money"
                  suffix="€"
                  onChange={(v) => {
                    const cents = parseCents(v);
                    if (cents !== null) updateMut.mutate({ amount_gross_cents: cents } as Partial<ReceiptDetail>);
                  }}
                />
                <Field
                  label="USt-Satz"
                  value={String(r.vat_rate ?? '')}
                  disabled={isLocked}
                  type="number"
                  suffix="%"
                  onChange={(v) => {
                    const num = Number(v.replace(',', '.'));
                    if (Number.isFinite(num)) updateMut.mutate({ vat_rate: num } as Partial<ReceiptDetail>);
                  }}
                />
                <Field
                  label="Netto"
                  value={formatCurrencyFromCents(r.amount_net_cents)}
                  disabled
                />
                <Field
                  label="USt-Betrag"
                  value={formatCurrencyFromCents(r.vat_amount_cents)}
                  disabled
                />
                <Field
                  label="Bezahlt"
                  value={formatCentsForInput(
                    (r as ReceiptDetail & { paid_amount_cents?: number }).paid_amount_cents ?? null,
                  )}
                  disabled={isLocked}
                  type="money"
                  suffix="€"
                  onChange={(v) => {
                    const cents = parseCents(v);
                    updateMut.mutate({ paid_amount_cents: cents ?? 0 } as Partial<ReceiptDetail>);
                  }}
                />
                <p
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--color-on-surface-variant)',
                    fontFamily: 'var(--font-body)',
                    marginTop: '0.25rem',
                    fontStyle: 'italic',
                  }}
                >
                  Netto und USt-Betrag werden automatisch aus Brutto + USt-Satz berechnet.
                </p>
              </Section>

              <Section title="Steuer">
                {belegeSettings?.reverse_charge_enabled === 'true' && (
                  <BooleanField
                    label="Reverse Charge"
                    value={reverseCharge}
                    disabled={isLocked}
                    onChange={(v) => updateMut.mutate({ reverse_charge: v ? 1 : 0 } as Partial<ReceiptDetail>)}
                  />
                )}
                <BooleanField
                  label="Vorsteuer abziehbar"
                  value={inputTaxDeductible}
                  disabled={isLocked}
                  onChange={(v) => updateMut.mutate({ input_tax_deductible: v ? 1 : 0 } as Partial<ReceiptDetail>)}
                />
                <SelectField
                  label="Steuerkategorie"
                  value={String((r as ReceiptDetail & { tax_category_id?: number | null }).tax_category_id ?? '')}
                  disabled={isLocked}
                  options={taxCategories.map((tc) => ({
                    value: String(tc.id),
                    label: tc.name,
                  }))}
                  onChange={(v) => {
                    const tcId = v === '' ? null : Number(v);
                    updateMut.mutate({ tax_category_id: tcId } as Partial<ReceiptDetail>);
                  }}
                />
                <BooleanField
                  label="Steuerrelevant"
                  value={
                    (r as ReceiptDetail & { steuerrelevant?: number }).steuerrelevant !== 0
                  }
                  disabled={isLocked}
                  onChange={(v) => updateMut.mutate({ steuerrelevant: v ? 1 : 0 } as Partial<ReceiptDetail>)}
                />
              </Section>

              <Section title="Zuordnung">
                <AreaPicker
                  areas={areas}
                  selected={r.area_links.map((a) => ({ id: a.area_id, isPrimary: a.is_primary === 1 }))}
                  disabled={isLocked || setAreasMut.isPending}
                  onChange={(ids, primary) => setAreasMut.mutate({ ids, primary })}
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

                {/* Vertrag-Verknüpfung (Feature 3, Plan quick-260702-vz7) */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 1fr',
                    gap: '0.75rem',
                    alignItems: 'flex-start',
                    padding: '0.25rem 0',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-on-surface-variant)',
                      fontFamily: 'var(--font-body)',
                      fontWeight: 500,
                      paddingTop: '0.375rem',
                    }}
                  >
                    Vertrag
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {r.contract_id && r.contract ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <button
                          type="button"
                          onClick={() => navigate('/contracts', { state: { openContractId: r.contract_id } })}
                          title="Zum Vertrag springen"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            background: 'rgba(148,170,255,0.12)',
                            border: '1px solid rgba(148,170,255,0.35)',
                            borderRadius: '999px',
                            padding: '0.3rem 0.75rem',
                            color: 'var(--color-primary)',
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '0.95rem' }}>description</span>
                          {r.contract.title} · {intervalLabel(r.contract.cost_interval)}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateMut.mutate({ contract_id: null } as Partial<ReceiptDetail>)}
                          disabled={updateMut.isPending}
                          title="Verknüpfung entfernen"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-on-surface-variant)',
                            cursor: updateMut.isPending ? 'not-allowed' : 'pointer',
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.78rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.15rem',
                          }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '0.9rem' }}>close</span>
                          entfernen
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <ContractPicker
                            onSelect={(contract) =>
                              updateMut.mutate({ contract_id: contract.id } as Partial<ReceiptDetail>)
                            }
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewContractPanel((v) => !v)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.375rem',
                              background: 'rgba(255,255,255,0.04)',
                              border: '1px solid rgba(148,170,255,0.2)',
                              borderRadius: '0.5rem',
                              padding: '0.5rem 0.875rem',
                              color: 'var(--color-on-surface)',
                              fontFamily: 'var(--font-body)',
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>add_circle</span>
                            Neuen Vertrag anlegen
                          </button>
                        </div>
                        {showNewContractPanel && (
                          <NewContractPanel
                            receipt={r}
                            onCreated={(newId) => {
                              updateMut.mutate({ contract_id: newId } as Partial<ReceiptDetail>);
                              setShowNewContractPanel(false);
                            }}
                            onCancel={() => setShowNewContractPanel(false)}
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </Section>

              {/* Fahrt-Details (read-only, Plan quick-260705-uq4) — nur bei Fahrt-Belegen,
                  immer live aus der Fahrt/dem Beleg abgeleitet */}
              {r.type === 'fahrt' && (() => {
                const einfach = r.trip_distance_km ?? 0;
                const ratePerKmCents = r.trip_rate_per_km_cents ?? 0;
                return (
                  <Section title="Fahrt-Details">
                    <Field
                      label="Einfache Strecke"
                      value={`${einfach.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`}
                      disabled
                    />
                    <Field
                      label="Hin+Rück"
                      value={`${(einfach * 2).toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`}
                      disabled
                    />
                    <Field
                      label="Satz"
                      value={`${(ratePerKmCents / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/km`}
                      disabled
                    />
                    <Field
                      label="Betrag"
                      value={formatCurrencyFromCents(r.amount_gross_cents)}
                      disabled
                    />
                  </Section>
                );
              })()}

              {/* Abwesenheitspauschale (read-only, Plan quick-260705-u2c) — nur bei Fahrt-Belegen */}
              {r.type === 'fahrt' && (() => {
                const hours = abwesenheitsStunden(r.trip_departure_time, r.trip_return_time);
                const cents = r.trip_meal_allowance_cents ?? 0;
                const hatAbwesenheit =
                  !!(r.trip_departure_time && r.trip_return_time) || cents > 0;
                return (
                  <Section title="Abwesenheitspauschale">
                    {hatAbwesenheit ? (
                      <>
                        <Field label="Abfahrt" value={r.trip_departure_time ?? '–'} disabled />
                        <Field label="Rückkehr" value={r.trip_return_time ?? '–'} disabled />
                        <Field
                          label="Abwesenheitsdauer"
                          value={hours !== null ? `${hours.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Std` : '–'}
                          disabled
                        />
                        <Field label="Pauschale" value={formatCurrencyFromCents(cents)} disabled />
                      </>
                    ) : (
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-body)', margin: '0.25rem 0' }}>
                        Keine Abwesenheitspauschale erfasst. Sie kann bei der Fahrt im Fahrten-Modul eingetragen werden.
                      </p>
                    )}
                  </Section>
                );
              })()}

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
                  {/* Fahrten (km-Pauschale) sind keine bezahlbaren Rechnungen -> kein "Als bezahlt markieren" */}
                  {r.status !== 'bezahlt' && r.status !== 'storniert' && r.type !== 'fahrt' && (
                    !showPaidConfirm ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPaidDate(r.payment_date || todayLocal());
                          setShowPaidConfirm(true);
                        }}
                        disabled={updateMut.isPending}
                        style={{
                          background: 'rgba(92,253,128,0.12)',
                          color: '#5cfd80',
                          border: '1px solid rgba(92,253,128,0.35)',
                          borderRadius: '0.5rem',
                          padding: '0.625rem 1.25rem',
                          fontSize: '0.875rem',
                          fontFamily: 'Manrope, sans-serif',
                          fontWeight: 600,
                          cursor: updateMut.isPending ? 'wait' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.375rem',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>paid</span>
                        Als bezahlt markieren
                      </button>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                          type="date"
                          value={paidDate}
                          onChange={(e) => setPaidDate(e.target.value)}
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            color: 'var(--color-on-surface)',
                            border: '1px solid rgba(148,170,255,0.2)',
                            borderRadius: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.875rem',
                            colorScheme: 'dark',
                            outline: 'none',
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            updateMut.mutate({ status: 'bezahlt', payment_date: paidDate });
                            setShowPaidConfirm(false);
                          }}
                          disabled={updateMut.isPending || !paidDate}
                          style={{
                            background: 'rgba(92,253,128,0.12)',
                            color: '#5cfd80',
                            border: '1px solid rgba(92,253,128,0.35)',
                            borderRadius: '0.5rem',
                            padding: '0.625rem 1.25rem',
                            fontSize: '0.875rem',
                            fontFamily: 'Manrope, sans-serif',
                            fontWeight: 700,
                            cursor: updateMut.isPending || !paidDate ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            opacity: updateMut.isPending || !paidDate ? 0.6 : 1,
                          }}
                        >
                          Bestätigen
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowPaidConfirm(false)}
                          style={{
                            background: 'rgba(255,255,255,0.04)',
                            color: 'var(--color-on-surface-variant)',
                            border: '1px solid rgba(148,170,255,0.2)',
                            borderRadius: '0.5rem',
                            padding: '0.625rem 1.25rem',
                            fontSize: '0.875rem',
                            fontFamily: 'var(--font-body)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                          }}
                        >
                          Abbrechen
                        </button>
                      </div>
                    )
                  )}
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
                        background: 'linear-gradient(90deg, var(--color-primary), var(--color-secondary))',
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

              <CollapsibleSection title="Verlauf" count={r.audit_log.length}>
                <AuditTrail entries={r.audit_log} />
              </CollapsibleSection>
            </div>
          </div>
        </div>
      </div>

      {lightboxOpen && fileUrl && primaryFile && (
        <BelegLightbox url={fileUrl} mimeType={primaryFile.mime_type} onClose={() => setLightboxOpen(false)} />
      )}
    </PageWrapper>
  );
}

/** Abwesenheitsdauer in Std aus "HH:MM"-Zeiten (Folgetag-Logik wie Backend). Null bei ungültig/leer. */
function abwesenheitsStunden(dep?: string | null, ret?: string | null): number | null {
  const parse = (v?: string | null): number | null => {
    if (!v) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  };
  const d = parse(dep);
  const r = parse(ret);
  if (d === null || r === null) return null;
  let dur = r - d;
  if (dur <= 0) dur += 24 * 60; // Nacht-Gig -> Folgetag
  return dur / 60;
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

/**
 * Einklappbare Sektion — Styling identisch zu `Section`, aber der Header ist
 * klickbar und toggelt den Body. Standardmäßig zugeklappt (Feature 1,
 * Plan quick-260702-vz7): Verlauf/Audit-Trail soll die Seite nicht dauerhaft
 * dominieren, bleibt aber erreichbar.
 */
function CollapsibleSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      style={{
        background: 'var(--color-surface-variant)',
        borderRadius: '0.75rem',
        padding: '1.25rem',
        border: '1px solid rgba(148,170,255,0.08)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          marginBottom: open ? '0.75rem' : 0,
          cursor: 'pointer',
        }}
      >
        <h3
          style={{
            fontFamily: 'Manrope, sans-serif',
            fontSize: '0.75rem',
            fontWeight: 700,
            margin: 0,
            color: 'var(--color-on-surface-variant)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {title} ({count} Einträge)
        </h3>
        <span className="material-symbols-outlined" style={{ fontSize: '1.25rem', color: 'var(--color-on-surface-variant)' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>{children}</div>}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vertrag-Verknüpfung — Helpers + Inline-Anlege-Panel (Feature 3, quick-260702-vz7)
// ─────────────────────────────────────────────────────────────────────────────

/** Erlaubte Vertrags-Areas (CHECK-Constraint in contracts_and_deadlines). */
const CONTRACT_ALLOWED_AREAS = ['Privat', 'DJ', 'Amazon', 'Cashback', 'Finanzen', 'Banken', 'Sonstiges'];

/** Mappt eine Beleg-Area auf eine erlaubte Vertrags-Area: exakter Treffer → übernehmen, "Amazon FBA" → Amazon, sonst → Sonstiges. */
function mapAreaToContractArea(areaName: string | null): string {
  if (!areaName) return 'Sonstiges';
  if (CONTRACT_ALLOWED_AREAS.includes(areaName)) return areaName;
  if (areaName === 'Amazon FBA') return 'Amazon';
  return 'Sonstiges';
}

function intervalLabel(interval: string | null | undefined): string {
  switch (interval) {
    case 'jaehrlich':
      return 'jährlich';
    case 'monatlich':
      return 'monatlich';
    case 'quartalsweise':
      return 'quartalsweise';
    case 'einmalig':
      return 'einmalig';
    default:
      return '—';
  }
}

const INTERVAL_STEP_MONTHS: Record<string, number> = { monatlich: 1, quartalsweise: 3, jaehrlich: 12 };

function parseYMD(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function formatYMD(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addMonthsClamped(start: { y: number; m: number; d: number }, months: number): { y: number; m: number; d: number } {
  const totalM = start.y * 12 + (start.m - 1) + months;
  const ny = Math.floor(totalM / 12);
  const nm = (totalM % 12) + 1;
  const daysInMonth = new Date(ny, nm, 0).getDate();
  const nd = Math.min(start.d, daysInMonth);
  return { y: ny, m: nm, d: nd };
}

/**
 * Nächste zukünftige Fälligkeit (>= today) für ein Zahlungsintervall ab
 * start_date — spiegelt die Backend-Logik in contractReminders.ts (bewusst
 * dupliziert, siehe CLAUDE.md-Konvention "kein Monorepo").
 */
function computeNextDueLocal(startDate: string, today: string, interval: string): string | null {
  const step = INTERVAL_STEP_MONTHS[interval];
  if (!step || !startDate) return null;
  const start = parseYMD(startDate);
  const maxIter = Math.ceil((100 * 12) / step);
  for (let i = 0; i <= maxIter; i++) {
    const occ = addMonthsClamped(start, i * step);
    const candidate = formatYMD(occ.y, occ.m, occ.d);
    if (candidate >= today) return candidate;
  }
  return null;
}

function NewContractPanel({
  receipt,
  onCreated,
  onCancel,
}: {
  receipt: ReceiptDetail;
  onCreated: (contractId: number) => void;
  onCancel: () => void;
}) {
  const primaryAreaName = receipt.area_links.find((a) => a.is_primary === 1)?.area_name ?? null;
  const mappedArea = mapAreaToContractArea(primaryAreaName);
  const [title, setTitle] = useState(receipt.supplier_name ?? '');
  const [costInterval, setCostInterval] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const costAmount = receipt.amount_gross_cents / 100;

  // Erinnerungsdatum-Vorschlag: naechste Faelligkeit minus 4 Wochen (Spalten-Default
  // cancellation_notice_weeks) — solange kein Intervall (bzw. einmalig) gewaehlt ist,
  // gibt es keinen Vorschlag. Der Vorschlag ist jederzeit ueberschreibbar.
  useEffect(() => {
    if (!costInterval || costInterval === 'einmalig') {
      setReminderDate('');
      return;
    }
    const nextDue = computeNextDueLocal(receipt.receipt_date, todayLocal(), costInterval);
    setReminderDate(nextDue ? addDaysLocal(nextDue, -28) : '');
  }, [costInterval, receipt.receipt_date]);

  async function handleCreate() {
    if (!title.trim()) {
      setError('Titel erforderlich');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createContract({
        title: title.trim(),
        provider_name: receipt.supplier_name,
        cost_amount: costAmount,
        currency: receipt.currency,
        area: mappedArea,
        start_date: receipt.receipt_date,
        cost_interval: costInterval || null,
        reminder_date: reminderDate || null,
      });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vertrag konnte nicht angelegt werden');
    } finally {
      setSaving(false);
    }
  }

  const panelInputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(148,170,255,0.15)',
    borderRadius: '0.375rem',
    padding: '0.375rem 0.625rem',
    color: 'var(--color-on-surface)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.85rem',
    outline: 'none',
  };
  const panelLabelStyle: React.CSSProperties = {
    fontSize: '0.7rem',
    color: 'var(--color-on-surface-variant)',
    fontFamily: 'var(--font-body)',
    display: 'block',
    marginBottom: '0.2rem',
  };

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(148,170,255,0.15)',
        borderRadius: '0.5rem',
        padding: '0.875rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
      }}
    >
      <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Neuer Vertrag
      </p>

      <div>
        <label style={panelLabelStyle}>Titel</label>
        <input style={{ ...panelInputStyle, width: '100%', boxSizing: 'border-box' }} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
        <div>
          <label style={panelLabelStyle}>Betrag</label>
          <input style={{ ...panelInputStyle, width: '100%', boxSizing: 'border-box' }} value={`${costAmount.toFixed(2)} ${receipt.currency}`} disabled />
        </div>
        <div>
          <label style={panelLabelStyle}>Bereich</label>
          <input style={{ ...panelInputStyle, width: '100%', boxSizing: 'border-box' }} value={mappedArea} disabled />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
        <div>
          <label style={panelLabelStyle}>Startdatum</label>
          <input style={{ ...panelInputStyle, width: '100%', boxSizing: 'border-box' }} value={formatDate(receipt.receipt_date)} disabled />
        </div>
        <div>
          <label style={panelLabelStyle}>Zahlungsintervall</label>
          <select
            style={{ ...panelInputStyle, width: '100%', boxSizing: 'border-box' }}
            value={costInterval}
            onChange={(e) => setCostInterval(e.target.value)}
          >
            <option value="">— wählen —</option>
            <option value="einmalig">Einmalig</option>
            <option value="monatlich">Monatlich</option>
            <option value="quartalsweise">Quartalsweise</option>
            <option value="jaehrlich">Jährlich</option>
          </select>
        </div>
      </div>

      <div>
        <label style={panelLabelStyle}>Erinnerungsdatum (Vorschlag, editierbar)</label>
        <input
          type="date"
          style={{ ...panelInputStyle, width: '100%', boxSizing: 'border-box' }}
          value={reminderDate}
          onChange={(e) => setReminderDate(e.target.value)}
        />
      </div>

      {error && <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-error)', fontFamily: 'var(--font-body)' }}>{error}</p>}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: '1px solid rgba(148,170,255,0.2)',
            borderRadius: '0.5rem',
            padding: '0.4rem 1rem',
            color: 'var(--color-on-surface-variant)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            cursor: 'pointer',
          }}
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving}
          style={{
            background: 'rgba(148,170,255,0.18)',
            border: '1px solid rgba(148,170,255,0.4)',
            borderRadius: '0.5rem',
            padding: '0.4rem 1rem',
            color: 'var(--color-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: saving ? 'wait' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Wird angelegt…' : 'Anlegen'}
        </button>
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  disabled?: boolean;
  type?: 'text' | 'date' | 'number' | 'money';
  /** Suffix nach dem Input — z.B. "€" oder "%". Optional. */
  suffix?: string;
  onChange?: (v: string) => void;
}

function Field({ label, value, disabled, type = 'text', suffix, onChange }: FieldProps) {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <input
            type={type === 'date' ? 'date' : 'text'}
            inputMode={type === 'money' || type === 'number' ? 'decimal' : undefined}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
              if (localValue !== value) onChange!(localValue);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            style={{
              flex: 1,
              minWidth: 0,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(148,170,255,0.15)',
              borderRadius: '0.375rem',
              padding: '0.375rem 0.625rem',
              color: 'var(--color-on-surface)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              outline: 'none',
              textAlign: type === 'money' || type === 'number' ? 'right' : 'left',
            }}
          />
          {suffix && (
            <span
              style={{
                fontSize: '0.85rem',
                color: 'var(--color-on-surface-variant)',
                fontFamily: 'var(--font-body)',
                minWidth: '1ch',
              }}
            >
              {suffix}
            </span>
          )}
        </div>
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

/** Toggle ja/nein — schreibt 0/1 ueber onChange. */
function BooleanField({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  const editable = !!onChange && !disabled;
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
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {[true, false].map((opt) => (
            <button
              key={String(opt)}
              type="button"
              onClick={() => {
                if (opt !== value) onChange!(opt);
              }}
              style={{
                background: opt === value ? 'rgba(148,170,255,0.18)' : 'rgba(255,255,255,0.04)',
                color: opt === value ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                border: opt === value ? '1px solid rgba(148,170,255,0.4)' : '1px solid rgba(148,170,255,0.15)',
                borderRadius: '0.375rem',
                padding: '0.25rem 0.875rem',
                fontSize: '0.8rem',
                fontFamily: 'var(--font-body)',
                cursor: 'pointer',
                fontWeight: opt === value ? 600 : 400,
              }}
            >
              {opt ? 'ja' : 'nein'}
            </button>
          ))}
        </div>
      ) : (
        <span
          style={{
            fontSize: '0.85rem',
            color: 'var(--color-on-surface)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {value ? 'ja' : 'nein'}
        </span>
      )}
    </div>
  );
}

/** Dropdown — z.B. Steuerkategorie. */
function SelectField({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  /** Aktueller Wert (id als string oder leer). */
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  onChange?: (v: string) => void;
}) {
  const editable = !!onChange && !disabled;
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
        <select
          value={value}
          onChange={(e) => onChange!(e.target.value)}
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
        >
          <option value="">– keine –</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <span
          style={{
            fontSize: '0.85rem',
            color: 'var(--color-on-surface)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {options.find((o) => o.value === value)?.label ?? '–'}
        </span>
      )}
    </div>
  );
}

/**
 * Komma↔Punkt-Conversion fuer DE-Geld-Eingabe.
 * "21,42" oder "21.42" → 2142 Cents. Leer / Garbage → null.
 */
function parseCents(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

/** Cents → "21,42" (ohne Suffix). */
function formatCentsForInput(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Multi-Pill-Picker fuer receipt_area_links.
 *
 * Klick auf eine nicht-ausgewaehlte Pill → hinzufuegen (wird automatisch primary
 * wenn sie die einzige Auswahl ist). Klick auf eine ausgewaehlte Pill → entfernen.
 * Stern-Icon neben mehreren Auswahlen erlaubt das primary-Setzen.
 */
function AreaPicker({
  areas,
  selected,
  disabled,
  onChange,
}: {
  areas: Area[];
  selected: Array<{ id: number; isPrimary: boolean }>;
  disabled?: boolean;
  onChange: (ids: number[], primary?: number) => void;
}) {
  const selectedIds = selected.map((s) => s.id);
  const primaryId = selected.find((s) => s.isPrimary)?.id;
  const isMulti = selected.length > 1;

  const toggle = (areaId: number) => {
    if (disabled) return;
    if (selectedIds.includes(areaId)) {
      const newIds = selectedIds.filter((x) => x !== areaId);
      // primary nachziehen wenn primary entfernt wurde
      const newPrimary = primaryId === areaId
        ? (newIds.length > 0 ? newIds[0] : undefined)
        : primaryId;
      onChange(newIds, newPrimary);
    } else {
      const newIds = [...selectedIds, areaId];
      const newPrimary = primaryId ?? areaId;
      onChange(newIds, newPrimary);
    }
  };

  const setPrimary = (areaId: number) => {
    if (disabled) return;
    if (!selectedIds.includes(areaId)) return;
    onChange(selectedIds, areaId);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '140px 1fr',
        gap: '0.75rem',
        alignItems: 'flex-start',
        padding: '0.25rem 0',
      }}
    >
      <span
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-on-surface-variant)',
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          paddingTop: '0.375rem',
        }}
      >
        Bereiche
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {areas.length === 0 ? (
          <span
            style={{
              fontSize: '0.85rem',
              color: 'var(--color-on-surface-variant)',
              fontFamily: 'var(--font-body)',
              fontStyle: 'italic',
            }}
          >
            Keine Bereiche konfiguriert (siehe /belege/einstellungen).
          </span>
        ) : (
          areas
            .filter((a) => !a.archived)
            .map((a) => {
              const isSelected = selectedIds.includes(a.id);
              const isPrimary = primaryId === a.id;
              return (
                <span
                  key={a.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.125rem' }}
                >
                  <button
                    type="button"
                    onClick={() => toggle(a.id)}
                    disabled={disabled}
                    style={{
                      background: isSelected
                        ? `${a.color}28`
                        : 'rgba(255,255,255,0.04)',
                      color: isSelected ? a.color : 'var(--color-on-surface-variant)',
                      border: isSelected
                        ? `1px solid ${a.color}88`
                        : '1px solid rgba(148,170,255,0.15)',
                      borderRadius: '999px',
                      padding: '0.25rem 0.75rem',
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-body)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      fontWeight: isSelected ? 600 : 400,
                      opacity: disabled ? 0.6 : 1,
                    }}
                    title={
                      isSelected
                        ? `${a.name} entfernen`
                        : `${a.name} hinzufuegen`
                    }
                  >
                    {a.name}
                    {isPrimary && isMulti && (
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '0.95rem', marginLeft: '0.25rem', verticalAlign: '-2px' }}
                      >
                        star
                      </span>
                    )}
                  </button>
                  {isSelected && isMulti && !isPrimary && (
                    <button
                      type="button"
                      onClick={() => setPrimary(a.id)}
                      disabled={disabled}
                      title="Als primaeren Bereich setzen"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-on-surface-variant)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        padding: '0.125rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: '0.95rem' }}
                      >
                        star_border
                      </span>
                    </button>
                  )}
                </span>
              );
            })
        )}
      </div>
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

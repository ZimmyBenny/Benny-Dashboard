/**
 * BelegeUploadPage — /belege/neu (Phase 04 Plan 09).
 *
 * Zentraler Use-Case des Belege-Moduls:
 *  1. User dropt PDFs/Bilder via DropzoneBelege → uploadReceipts (multipart)
 *  2. Backend legt receipts mit status='ocr_pending' an + startet Background-OCR
 *  3. Frontend pollt GET /api/belege/:id alle 2s bis status !== 'ocr_pending'
 *  4. OCR-Vorschlaege werden vorausgefuellt + mit OcrConfidenceBadge versehen
 *  5. Lieferant erkannt → fetchSupplierSuggest → Bereich + Steuer-Kategorie
 *     werden automatisch vorgeschlagen (sofern noch leer)
 *  6. User korrigiert ggf. + speichert → updateReceipt + setReceiptAreas
 *     (recordUsage-Hook im Backend lernt den Tripel)
 *
 * Multi-File: nach Upload zeigen wir pro hochgeladenem Beleg einen Tab —
 * der ReceiptEditor des aktiven Tabs pollt selbststaendig.
 *
 * Query-Param: ?area=DJ vorbelegt den Bereich-Picker (UX fuer Sub-Reiter
 * "Beleg fuer DJ erstellen"-Flows).
 */
import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { DropzoneBelege } from '../../components/belege/DropzoneBelege';
import { OcrConfidenceBadge } from '../../components/belege/OcrConfidenceBadge';
import { StatusBadge } from '../../components/dj/StatusBadge';
import {
  uploadReceipts,
  fetchReceipt,
  fetchSupplierSuggest,
  updateReceipt,
  setReceiptAreas,
  fetchAreas,
  fetchTaxCategories,
  type ReceiptDetail,
  type ReceiptListItem,
  type Area,
  type TaxCategory,
  type UploadResult,
} from '../../api/belege.api';

// ── lokaler Input-Stil (DJ-Stil) ─────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  background: 'var(--color-surface-container-high)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '0.4rem',
  color: 'inherit',
  fontSize: '0.95rem',
  width: '100%',
  fontFamily: 'inherit',
};

// ── Page ─────────────────────────────────────────────────────────────────

export function BelegeUploadPage() {
  const [searchParams] = useSearchParams();
  const queryArea = searchParams.get('area'); // z.B. ?area=DJ
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [createdIds, setCreatedIds] = useState<number[]>([]);
  const [duplicates, setDuplicates] = useState<
    Array<{ original_filename: string; existingId: number }>
  >([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [rejectMsg, setRejectMsg] = useState<string | null>(null);

  const { data: areas = [] } = useQuery({
    queryKey: ['areas'],
    queryFn: fetchAreas,
  });
  const { data: taxCats = [] } = useQuery({
    queryKey: ['tax-categories'],
    queryFn: fetchTaxCategories,
  });

  const uploadMut = useMutation({
    mutationFn: uploadReceipts,
    onSuccess: (data: UploadResult) => {
      const newIds = data.created
        .filter((c) => !c.duplicate)
        .map((c) => c.id);
      const dups = data.created
        .filter((c) => c.duplicate && c.existingId)
        .map((c) => ({
          original_filename: c.original_filename,
          existingId: c.existingId as number,
        }));
      setCreatedIds((prev) => [...prev, ...newIds]);
      setDuplicates((prev) => [...prev, ...dups]);
      if (newIds[0] && activeId === null) setActiveId(newIds[0]);
      qc.invalidateQueries({ queryKey: ['belege'] });
    },
  });

  return (
    <PageWrapper>
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          padding: '2rem 1rem',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-headline)',
            fontSize: '2.25rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            marginBottom: '0.25rem',
          }}
        >
          Neuer Beleg
        </h1>
        <p
          style={{
            color: 'var(--color-on-surface-variant)',
            fontSize: '0.95rem',
            marginBottom: '1.5rem',
          }}
        >
          Belege hochladen, OCR-Vorschläge prüfen und speichern. Mehrere Dateien
          gleichzeitig möglich.
        </p>

        <DropzoneBelege
          maxSizeMb={25}
          disabled={uploadMut.isPending}
          onDrop={(files) => {
            setRejectMsg(null);
            uploadMut.mutate(files);
          }}
          onReject={(rejected) => {
            const reasons = rejected
              .map(
                (r) =>
                  `${r.file.name}: ${r.errors.map((e) => e.message).join(', ')}`,
              )
              .join('\n');
            setRejectMsg(
              `${rejected.length} Datei(en) abgelehnt — nur PDF/JPG/PNG bis 25 MB.\n${reasons}`,
            );
          }}
        />

        {uploadMut.isPending && (
          <p style={{ marginTop: '1rem', color: '#94aaff' }}>Lade hoch…</p>
        )}
        {uploadMut.isError && (
          <p
            style={{
              marginTop: '1rem',
              color: 'var(--color-error)',
              whiteSpace: 'pre-line',
            }}
          >
            Upload fehlgeschlagen: {(uploadMut.error as Error).message}
          </p>
        )}
        {rejectMsg && (
          <p
            style={{
              marginTop: '1rem',
              color: '#ffd166',
              whiteSpace: 'pre-line',
            }}
          >
            {rejectMsg}
          </p>
        )}

        {duplicates.length > 0 && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1rem',
              background: 'rgba(255,200,80,0.08)',
              border: '1px solid rgba(255,200,80,0.25)',
              borderRadius: '0.5rem',
            }}
          >
            <strong style={{ color: '#ffd166' }}>
              {duplicates.length} Duplikat(e) übersprungen:
            </strong>
            <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
              {duplicates.map((d, i) => (
                <li key={i} style={{ fontSize: '0.85rem' }}>
                  {d.original_filename} →{' '}
                  <button
                    type="button"
                    onClick={() => navigate(`/belege/${d.existingId}`)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      padding: 0,
                    }}
                  >
                    Beleg #{d.existingId} ansehen
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {createdIds.length > 0 && (
          <div style={{ marginTop: '2rem' }}>
            <h2
              style={{
                fontFamily: 'var(--font-headline)',
                fontSize: '1.25rem',
                fontWeight: 700,
                marginBottom: '0.75rem',
              }}
            >
              Hochgeladene Belege ({createdIds.length})
            </h2>
            <div
              style={{
                display: 'flex',
                gap: '0.5rem',
                flexWrap: 'wrap',
                marginBottom: '1rem',
              }}
            >
              {createdIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveId(id)}
                  style={{
                    padding: '0.5rem 1rem',
                    background:
                      id === activeId
                        ? 'var(--color-primary)'
                        : 'var(--color-surface-container)',
                    color: id === activeId ? '#fff' : 'inherit',
                    border:
                      id === activeId
                        ? '1px solid var(--color-primary)'
                        : '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  Beleg #{id}
                </button>
              ))}
            </div>
            {activeId !== null && (
              <ReceiptEditor
                key={activeId}
                id={activeId}
                areas={areas}
                taxCats={taxCats}
                initialArea={queryArea}
                onDone={() => navigate(`/belege/${activeId}`)}
              />
            )}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

// ── ReceiptEditor (Sub-Component) ────────────────────────────────────────

interface ReceiptEditorProps {
  id: number;
  areas: Area[];
  taxCats: TaxCategory[];
  initialArea: string | null;
  onDone: () => void;
}

function ReceiptEditor({
  id,
  areas,
  taxCats,
  initialArea,
  onDone,
}: ReceiptEditorProps) {
  const qc = useQueryClient();

  // Polling alle 2s solange OCR laeuft
  const { data: r } = useQuery({
    queryKey: ['belege', id],
    queryFn: () => fetchReceipt(id),
    refetchInterval: (query) => {
      const data = query.state.data as ReceiptDetail | undefined;
      return data?.status === 'ocr_pending' ? 2000 : false;
    },
  });

  const [supplier, setSupplier] = useState('');
  const [supplierInvNr, setSupplierInvNr] = useState('');
  const [date, setDate] = useState('');
  const [grossEur, setGrossEur] = useState('');
  const [vatRate, setVatRate] = useState('19');
  const [areaId, setAreaId] = useState<number | null>(null);
  const [taxCatId, setTaxCatId] = useState<number | null>(null);
  // Markiert ob die OCR-Vorbelegung schon einmal lief (verhindert Ueberschreiben
  // von User-Eingaben durch nachgelagerte Polls).
  const [prefilled, setPrefilled] = useState(false);
  // Markiert ob fetchSupplierSuggest bereits versucht wurde (verhindert
  // wiederholte Aufrufe bei jedem Re-Render).
  const [suggestTried, setSuggestTried] = useState<string | null>(null);

  // Initialfelder aus OCR-Daten setzen — nur einmal pro Receipt
  useEffect(() => {
    if (!r || prefilled) return;
    if (r.status === 'ocr_pending') return; // OCR noch nicht fertig
    if (r.supplier_name) setSupplier(r.supplier_name);
    if (r.supplier_invoice_number) setSupplierInvNr(r.supplier_invoice_number);
    if (r.receipt_date) setDate(r.receipt_date);
    if (r.amount_gross_cents) {
      setGrossEur((r.amount_gross_cents / 100).toFixed(2).replace('.', ','));
    }
    if (r.vat_rate !== null && r.vat_rate !== undefined) {
      setVatRate(String(r.vat_rate));
    }
    if (r.area_links && r.area_links.length > 0) {
      const primary = r.area_links.find((l) => l.is_primary === 1);
      setAreaId(primary?.area_id ?? r.area_links[0]!.area_id);
    } else if (initialArea) {
      const m = areas.find(
        (a) =>
          a.name.toLowerCase() === initialArea.toLowerCase() ||
          a.slug.toLowerCase() === initialArea.toLowerCase(),
      );
      if (m) setAreaId(m.id);
    }
    setPrefilled(true);
  }, [r, prefilled, initialArea, areas]);

  // Supplier-Suggest fetchen wenn supplier-Name gesetzt + areaId/taxCatId noch leer.
  // Triggert nur einmal pro supplier-Wert (Tracker via suggestTried).
  useEffect(() => {
    if (!supplier.trim()) return;
    if (suggestTried === supplier) return;
    if (areaId !== null && taxCatId !== null) return;
    setSuggestTried(supplier);
    fetchSupplierSuggest(supplier)
      .then((s) => {
        if (areaId === null && s.area_id !== null) setAreaId(s.area_id);
        if (taxCatId === null && s.tax_category_id !== null) {
          setTaxCatId(s.tax_category_id);
        }
      })
      .catch(() => {
        // 404 = kein Memory; silently skippen
      });
  }, [supplier, suggestTried, areaId, taxCatId]);

  const saveMut = useMutation({
    mutationFn: async () => {
      // Cents-Parse mit Komma-/Punkt-Toleranz; NaN → 0 (Beleg bleibt offen sichtbar im 'zu_pruefen')
      const grossNum = parseFloat(grossEur.replace(/\./g, '').replace(',', '.'));
      const grossCents = Number.isFinite(grossNum)
        ? Math.round(grossNum * 100)
        : 0;
      const vatRateNum = parseInt(vatRate, 10);
      const update: Partial<ReceiptListItem> = {
        supplier_name: supplier || null,
        supplier_invoice_number: supplierInvNr || null,
        receipt_date: date,
        amount_gross_cents: grossCents,
        vat_rate: Number.isFinite(vatRateNum) ? vatRateNum : 0,
        status: 'zu_pruefen',
      };
      await updateReceipt(id, update);
      // Tax-Category via PATCH (separat, weil tax_category_id nicht im
      // ReceiptListItem ist — Backend akzeptiert es trotzdem als Partial-Body)
      if (taxCatId !== null) {
        await updateReceipt(id, {
          ...({ tax_category_id: taxCatId } as Partial<ReceiptListItem>),
        });
      }
      // Area-Zuordnung separat — triggert recordUsage-Hook im Backend
      if (areaId !== null) {
        await setReceiptAreas(id, [areaId], areaId);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['belege', id] });
      qc.invalidateQueries({ queryKey: ['belege'] });
      onDone();
    },
  });

  if (!r) {
    return (
      <div
        style={{
          padding: '2rem',
          textAlign: 'center',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        Lade Beleg…
      </div>
    );
  }

  // OCR-Confidence (overall_confidence kann sowohl 0..1 als auch 0..100 sein —
  // Backend speichert in Plan 04-02 als 0..1 Float, koennte aber pro Engine
  // variieren; OcrConfidenceBadge normalisiert das).
  const ocrConf = r.ocr_results?.[0]?.overall_confidence ?? null;
  const isOcrPending = r.status === 'ocr_pending';

  return (
    <div
      style={{
        background: 'var(--color-surface-container)',
        padding: '1.25rem',
        borderRadius: '0.75rem',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        <StatusBadge
          status={
            r.status as
              | 'ocr_pending'
              | 'zu_pruefen'
              | 'freigegeben'
              | 'archiviert'
              | 'nicht_relevant'
          }
        />
        {!isOcrPending && ocrConf !== null && (
          <OcrConfidenceBadge confidence={ocrConf} />
        )}
        {isOcrPending && (
          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            OCR läuft im Hintergrund — Felder werden automatisch befüllt sobald
            fertig.
          </span>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '0.75rem 1rem',
        }}
      >
        <Lbl label="Lieferant">
          <input
            type="text"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="z.B. Thomann GmbH"
            style={inputStyle}
          />
        </Lbl>
        <Lbl label="Belegnummer (Lieferant)">
          <input
            type="text"
            value={supplierInvNr}
            onChange={(e) => setSupplierInvNr(e.target.value)}
            placeholder="z.B. RE-2026-0042"
            style={inputStyle}
          />
        </Lbl>
        <Lbl label="Datum">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </Lbl>
        <Lbl label="Brutto in EUR">
          <input
            type="text"
            inputMode="decimal"
            value={grossEur}
            onChange={(e) => setGrossEur(e.target.value)}
            placeholder="119,00"
            style={inputStyle}
          />
        </Lbl>
        <Lbl label="USt-Rate (%)">
          <select
            value={vatRate}
            onChange={(e) => setVatRate(e.target.value)}
            style={inputStyle}
          >
            <option value="0">0 %</option>
            <option value="7">7 %</option>
            <option value="19">19 %</option>
          </select>
        </Lbl>
        <Lbl label="Bereich">
          <select
            value={areaId ?? ''}
            onChange={(e) =>
              setAreaId(e.target.value ? Number(e.target.value) : null)
            }
            style={inputStyle}
          >
            <option value="">– bitte wählen –</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Lbl>
        <Lbl label="Steuer-Kategorie">
          <select
            value={taxCatId ?? ''}
            onChange={(e) =>
              setTaxCatId(e.target.value ? Number(e.target.value) : null)
            }
            style={inputStyle}
          >
            <option value="">– bitte wählen –</option>
            {taxCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Lbl>
      </div>

      <div
        style={{
          marginTop: '1.25rem',
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || !supplier || !date}
          style={{
            padding: '0.55rem 1.5rem',
            background: 'var(--color-primary)',
            border: 'none',
            borderRadius: '0.5rem',
            color: '#fff',
            cursor:
              saveMut.isPending || !supplier || !date
                ? 'not-allowed'
                : 'pointer',
            fontWeight: 600,
            opacity: saveMut.isPending || !supplier || !date ? 0.5 : 1,
          }}
        >
          {saveMut.isPending ? 'Speichere…' : 'Speichern'}
        </button>
        <button
          type="button"
          onClick={onDone}
          style={{
            padding: '0.55rem 1.5rem',
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '0.5rem',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          Zur Detailseite
        </button>
      </div>
      {saveMut.isError && (
        <p style={{ color: 'var(--color-error)', marginTop: '0.5rem' }}>
          {(saveMut.error as Error).message}
        </p>
      )}
    </div>
  );
}

// ── Lbl-Helper (Label + Input Wrapper) ───────────────────────────────────

function Lbl({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3rem',
        fontSize: '0.8rem',
        color: 'var(--color-on-surface-variant)',
      }}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

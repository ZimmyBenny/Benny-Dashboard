import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import db from '../db/connection';

const PDF_ARCHIVE_DIR = path.join(process.cwd(), 'backups', 'invoices');
const QUOTE_ARCHIVE_DIR = path.join(process.cwd(), 'backups', 'quotes');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function formatEur(n: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR';
}

function formatDateDE(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  const d = isoStr.slice(0, 10);
  const parts = d.split('-');
  if (parts.length !== 3) return isoStr;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

// ── Typen ────────────────────────────────────────────────────────────────────

interface CompanySettings {
  name: string;
  company: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  tax_number: string;
  vat_id: string | null;
  is_vat_liable: boolean;
  vat_rate: number;
  bank: {
    name: string;
    iban: string;
    bic: string;
    holder: string;
  };
}

interface QuoteRow {
  id: number;
  number: string | null;
  customer_id: number;
  event_id: number | null;
  subject: string | null;
  status: string;
  quote_date: string;
  valid_until: string | null;
  header_text: string | null;
  footer_text: string | null;
  subtotal_net: number;
  tax_total: number;
  total_gross: number;
  finalized_at: string | null;
  discount_value: number | null;
  discount_type: string | null;
  discount_description: string | null;
  notes: string | null;
  internal_notes: string | null;
  reference_number: string | null;
  optional_subtotal_net: number;
  optional_total_gross: number;
}

interface QuoteItem {
  position: number;
  description: string;
  quantity: number;
  unit: string;
  price_net: number;
  tax_rate: number;
  discount_pct: number;
  total_net: number;
  is_optional: number;
}

interface ContactRow {
  id: number;
  contact_kind: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  customer_number: string | null;
}

interface AddressRow {
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
}

interface EventRow {
  title: string | null;
  event_date: string | null;
}

// ── Footer-Renderer ───────────────────────────────────────────────────────────

function renderFooter(doc: PDFKit.PDFDocument, pageNum: number, totalPages: number) {
  // 1. Setting laden (DB-Wert ist JSON-String)
  const footerRow = db.prepare("SELECT value FROM dj_settings WHERE key = 'footer'").get() as { value: string } | undefined;
  if (!footerRow?.value) return;

  let footer: { col1: string; col2: string; col3: string; col4: string };
  try {
    const parsed = JSON.parse(footerRow.value) as Partial<{ col1: string; col2: string; col3: string; col4: string }>;
    footer = {
      col1: typeof parsed.col1 === 'string' ? parsed.col1 : '',
      col2: typeof parsed.col2 === 'string' ? parsed.col2 : '',
      col3: typeof parsed.col3 === 'string' ? parsed.col3 : '',
      col4: typeof parsed.col4 === 'string' ? parsed.col4 : '',
    };
  } catch {
    return; // malformed JSON → kein Footer
  }

  const cols = [footer.col1, footer.col2, footer.col3, footer.col4];
  if (cols.every(c => !c.trim())) return; // alle 4 leer → kein Footer

  // 2. Margin temporär auf 0 (wie zuvor) — Footer-Y liegt außerhalb Content-Area
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  const pageWidth = doc.page.width;
  const mL = 71;
  const mR = 57;
  const usableWidth = pageWidth - mL - mR;
  const footerY = doc.page.height - 71;

  // 3. 1pt graue Trennlinie (unverändert)
  doc.save()
    .moveTo(mL, footerY)
    .lineTo(pageWidth - mR, footerY)
    .lineWidth(1)
    .strokeColor('#CCCCCC')
    .stroke()
    .restore();

  // 4. 4 Spalten rendern — langer Text umbricht innerhalb der Spalte (kein Abschneiden)
  const colWidths = [usableWidth * 0.24, usableWidth * 0.24, usableWidth * 0.22, usableWidth * 0.30];
  doc.save().font('Helvetica').fontSize(8).fillColor('#666666');

  let colX = mL;
  for (let i = 0; i < 4; i++) {
    const text = cols[i].trim();
    if (text) {
      const w = colWidths[i] - (i < 3 ? 4 : 0);
      doc.text(text, colX, footerY + 8, { width: w, lineGap: 1 });
    }
    colX += colWidths[i];
  }

  // Seitenzahl rechts über der Footer-Linie
  const pageLabel = `${pageNum}/${totalPages}`;
  doc.text(pageLabel, mL, footerY - 14, { width: usableWidth, align: 'right', lineBreak: false });

  doc.restore();
  doc.page.margins.bottom = savedBottom;
}

// ── Hauptfunktion ─────────────────────────────────────────────────────────────

export async function generateQuotePreviewPdf(quoteId: number): Promise<Buffer> {
  // --- Daten laden ---
  const quote = db.prepare(
    'SELECT * FROM dj_quotes WHERE id = ? AND deleted_at IS NULL'
  ).get(quoteId) as QuoteRow | undefined;
  if (!quote) throw new Error(`Angebot ${quoteId} nicht gefunden`);

  const items = db.prepare(
    'SELECT * FROM dj_quote_items WHERE quote_id = ? ORDER BY position'
  ).all(quoteId) as QuoteItem[];

  const contact = db.prepare(
    'SELECT id, contact_kind, salutation, first_name, last_name, organization_name, customer_number FROM contacts WHERE id = ?'
  ).get(quote.customer_id) as ContactRow | undefined;

  let address: AddressRow | undefined = db.prepare(
    'SELECT street, postal_code, city, country FROM contact_addresses WHERE contact_id = ? AND is_primary = 1 LIMIT 1'
  ).get(quote.customer_id) as AddressRow | undefined;
  if (!address) {
    address = db.prepare(
      'SELECT street, postal_code, city, country FROM contact_addresses WHERE contact_id = ? LIMIT 1'
    ).get(quote.customer_id) as AddressRow | undefined;
  }

  const settingsRow = db.prepare(
    "SELECT value FROM dj_settings WHERE key = 'company'"
  ).get() as { value: string } | undefined;
  const rawCompany = settingsRow ? (JSON.parse(settingsRow.value) as Record<string, unknown>) : null;
  const company: CompanySettings = rawCompany
    ? ({
        ...rawCompany,
        address: String(rawCompany.address ?? (rawCompany as Record<string, unknown>).street ?? ''),
        bank: rawCompany.bank ?? { name: String(rawCompany.bank_name ?? ''), iban: String(rawCompany.iban ?? ''), bic: String(rawCompany.bic ?? ''), holder: '' },
      } as CompanySettings)
    : {
        name: 'Benjamin Zimmermann',
        company: 'Dein Event DJ | Benjamin Zimmermann',
        address: 'Mittelweg 10',
        zip: '93426',
        city: 'Roding',
        country: 'Deutschland',
        phone: '01711493222',
        email: 'Benjamin.Z@gmx.de',
        website: 'www.dein-event-dj.com',
        tax_number: '21129292323',
        vat_id: null,
        is_vat_liable: true,
        vat_rate: 19.0,
        bank: { name: 'Raiffeisenbank', iban: 'DE59753900000005302552', bic: 'GENODEF1NEW', holder: 'Benjamin Zimmermann' },
      };

  let event: EventRow | undefined;
  if (quote.event_id) {
    event = db.prepare(
      'SELECT title, event_date FROM dj_events WHERE id = ?'
    ).get(quote.event_id) as EventRow | undefined;
  }

  // --- PDF erstellen ---
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 71, bottom: 120, left: 71, right: 57 },
      autoFirstPage: true,
      bufferPages: true,
      info: {
        Title: quote.number ? `Angebot ${quote.number}` : 'Angebot (Entwurf)',
        Author: company.name,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const marginLeft = 71;
    const marginRight = 57;
    const pageWidth = doc.page.width;
    const usableWidth = pageWidth - marginLeft - marginRight;
    // --- Logo (oben rechts, ueber der Absenderzeile) ---
    // Logo-Pfad einmal aufloesen, wird per Seite (Page 1 + Folgeseiten) gerendert.
    const logoRow = db.prepare("SELECT value FROM dj_settings WHERE key = 'logo_path'").get() as { value: string } | undefined;
    const absLogoPath = logoRow?.value ? path.join(process.cwd(), logoRow.value) : null;
    const logoUsable = absLogoPath && fs.existsSync(absLogoPath) && path.extname(absLogoPath).toLowerCase() !== '.svg';
    const renderLogo = () => {
      if (!logoUsable || !absLogoPath) return;
      try {
        doc.image(absLogoPath, pageWidth - marginRight - 170, 30, { fit: [170, 80], align: 'right' });
      } catch {
        // Logo nicht renderbar — graceful skip
      }
    };
    renderLogo(); // Seite 1 — Folgeseiten via bufferedPageRange-Loop am Ende

    // --- Absenderzeile ---
    const senderText = `${company.name} \u00B7 ${company.address} \u00B7 ${company.zip} ${company.city}`;
    doc.font('Helvetica').fontSize(8).fillColor('#666666')
      .text(senderText, marginLeft, 100, { width: usableWidth * 0.58, lineBreak: false });
    const senderBottom = 115;
    doc.moveTo(marginLeft, senderBottom)
      .lineTo(pageWidth - marginRight, senderBottom)
      .lineWidth(0.5)
      .strokeColor('#999999')
      .stroke();

    // --- Empfänger-Block (links) & Meta-Block (rechts) ---
    const recipientStartY = senderBottom + 20;
    const metaX = marginLeft + usableWidth * 0.55;
    const metaWidth = usableWidth * 0.45;

    // Empfänger aufbauen
    const recipientLines: string[] = [];
    if (contact) {
      if (contact.contact_kind === 'organization') {
        recipientLines.push(contact.organization_name ?? '');
      } else {
        const nameParts = [contact.salutation, contact.first_name, contact.last_name].filter(Boolean);
        recipientLines.push(nameParts.join(' '));
        if (contact.organization_name) recipientLines.push(contact.organization_name);
      }
    }
    if (address) {
      if (address.street) recipientLines.push(address.street);
      if (address.postal_code || address.city) {
        recipientLines.push(`${address.postal_code ?? ''} ${address.city ?? ''}`.trim());
      }
      if (address.country && address.country !== 'Deutschland') {
        recipientLines.push(address.country);
      }
    }

    // Empfänger rendern
    doc.font('Helvetica').fontSize(11).fillColor('#000000');
    let recipientY = recipientStartY;
    for (const line of recipientLines) {
      doc.text(line, marginLeft, recipientY, { width: metaX - marginLeft - 20 });
      recipientY = doc.y;
    }

    // Meta-Block rendern (gleiche Y-Startposition wie Empfänger)
    const metaLabelWidth = 85;
    const metaValueWidth = metaWidth - metaLabelWidth;
    let metaY = recipientStartY;

    const quoteDisplayNumber = quote.number ?? 'Entwurf';

    const metaRows: Array<[string, string]> = [
      ['Angebots-Nr.:', quoteDisplayNumber],
      ['Angebotsdatum:', formatDateDE(quote.quote_date)],
      ['Gültig bis:', formatDateDE(quote.valid_until)],
    ];
    // Referenz: bevorzugt quote.reference_number (User-Eingabe Bestellnr.), Fallback event.title
    const referenzValue = (quote.reference_number && String(quote.reference_number).trim()) || event?.title;
    if (referenzValue) metaRows.push(['Referenz:', referenzValue]);
    if (contact?.customer_number) metaRows.push(['Kundennummer:', contact.customer_number]);
    metaRows.push(['Ansprechpartner:', 'Benjamin Zimmermann']);

    doc.font('Helvetica').fontSize(10).fillColor('#000000');
    for (const [label, value] of metaRows) {
      doc.text(label, metaX, metaY, { width: metaLabelWidth, continued: false });
      doc.text(value, metaX + metaLabelWidth, metaY, { width: metaValueWidth, align: 'right' });
      metaY = doc.y;
    }

    // --- Titelzeile ---
    // Wenn Betreff gesetzt: Betreff als Titel verwenden (sevDesk-Stil).
    // Sonst Fallback auf "Angebot Nr. X" / "Angebot (Entwurf)".
    const blockBottom = Math.max(recipientY, metaY);
    const titleY = blockBottom + 70;
    const subjectTrim = quote.subject ? String(quote.subject).trim() : '';
    const titleText = subjectTrim || (quote.number
      ? `Angebot Nr. ${quote.number}`
      : 'Angebot (Entwurf)');

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000')
      .text(titleText, marginLeft, titleY, { width: usableWidth });

    // --- Kopftext ---
    let currentY = doc.y + 35;
    if (quote.header_text) {
      const placeholderVars: Record<string, string> = {
        vorname: contact?.first_name ?? '',
        nachname: contact?.last_name ?? '',
        anrede: contact?.salutation ?? '',
        eventdatum: event?.event_date ? formatDateDE(event.event_date) : '',
        gueltig_bis: formatDateDE(quote.valid_until),
      };
      const headerText = replacePlaceholders(quote.header_text, placeholderVars);
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
        .text(headerText, marginLeft, currentY, { width: usableWidth, lineGap: 3 });
      currentY = doc.y + 30;
    }

    // --- Positionstabelle ---
    // Spaltenbreiten (relativ zu usableWidth ~467pt)
    const colWidths = [
      usableWidth * 0.05,   // Pos
      usableWidth * 0.42,   // Beschreibung
      usableWidth * 0.10,   // Menge
      usableWidth * 0.16,   // Einzelpreis
      usableWidth * 0.09,   // Rabatt
      usableWidth * 0.18,   // Gesamt
    ];
    const colX: number[] = [];
    let cx = marginLeft;
    for (const w of colWidths) {
      colX.push(cx);
      cx += w;
    }

    const rowHeight = 18;
    const headerY = currentY;

    // Header-Hintergrund
    doc.save()
      .rect(marginLeft, headerY, usableWidth, rowHeight)
      .fillColor('#F0F0F0')
      .fill()
      .restore();

    // Header-Text
    const headers = ['Pos.', 'Beschreibung', 'Menge', 'Einzelpreis', 'Rabatt', 'Gesamt'];
    const headerAligns: Array<'center' | 'left' | 'right'> = ['center', 'left', 'right', 'right', 'right', 'right'];

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], colX[i] + 3, headerY + 5, {
        width: colWidths[i] - 6,
        align: headerAligns[i],
        lineBreak: false,
      });
    }

    // Datenzeilen
    let dataY = headerY + rowHeight;
    const dataAligns: Array<'center' | 'left' | 'right'> = ['center', 'left', 'right', 'right', 'right', 'right'];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];

      // Beschreibung in Titel (erste Zeile, bold) + Rest (normal) splitten.
      // Dazwischen kommt eine Leerzeile im PDF, damit der Titel optisch absteht.
      const fullDesc = item.description ?? '';
      const firstNewline = fullDesc.indexOf('\n');
      const descTitle = firstNewline >= 0 ? fullDesc.slice(0, firstNewline) : fullDesc;
      const descBody = firstNewline >= 0 ? fullDesc.slice(firstNewline + 1).trim() : '';
      const descColWidth = colWidths[1] - 6;

      // Dynamische Zeilenhoehe — Titel (bold) + ggf. Leerzeile + Body (regular).
      doc.font('Helvetica-Bold').fontSize(10);
      const titleHeight = doc.heightOfString(descTitle || ' ', { width: descColWidth, lineGap: 1 });
      doc.font('Helvetica').fontSize(10);
      const bodyHeight = descBody
        ? doc.heightOfString(descBody, { width: descColWidth, lineGap: 1 })
        : 0;
      const blankLineHeight = descBody ? 6 : 0;
      const descHeight = titleHeight + blankLineHeight + bodyHeight;
      const dynamicRowHeight = Math.max(rowHeight, descHeight + 8);

      // Seitenumbruch pruefen
      if (dataY + dynamicRowHeight > doc.page.height - 120) {
        doc.addPage();
        // Auf Folgeseiten Platz fuer Logo (y=30 + Hoehe 80) lassen, sonst ueberlappt
        // der Tabellen-Header mit dem Logo.
        dataY = 130;
        // Tabellen-Header wiederholen
        doc.save()
          .rect(marginLeft, dataY, usableWidth, rowHeight)
          .fillColor('#F0F0F0')
          .fill()
          .restore();
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000');
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], colX[i] + 3, dataY + 5, {
            width: colWidths[i] - 6,
            align: headerAligns[i],
            lineBreak: false,
          });
        }
        dataY += rowHeight;
      }

      // Trennlinie
      doc.save()
        .moveTo(marginLeft, dataY)
        .lineTo(pageWidth - marginRight, dataY)
        .lineWidth(0.5)
        .strokeColor('#CCCCCC')
        .stroke()
        .restore();

      doc.font('Helvetica').fontSize(10).fillColor('#000000');
      const discountCell = item.discount_pct && item.discount_pct > 0
        ? `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(item.discount_pct)} %`
        : '';

      // Beschreibung: Titel bold + (optional) Leerzeile + Body regular
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
        .text(descTitle, colX[1] + 3, dataY + 4, {
          width: descColWidth,
          align: 'left',
          lineBreak: true,
          lineGap: 1,
        });
      if (descBody) {
        doc.font('Helvetica').fontSize(10).fillColor('#000000')
          .text(descBody, colX[1] + 3, dataY + 4 + titleHeight + blankLineHeight, {
            width: descColWidth,
            align: 'left',
            lineBreak: true,
            lineGap: 1,
          });
      }

      // Restliche Spalten einzeilig — bei optionalen Positionen: "Opt." statt Pos-Nr.,
      // und Klammern um die Netto-Summe (sevDesk-Stil).
      const isOptional = item.is_optional === 1;
      const cells = [
        { idx: 0, value: isOptional ? 'Opt.' : String(item.position) },
        { idx: 2, value: new Intl.NumberFormat('de-DE').format(item.quantity) },
        { idx: 3, value: formatEur(item.price_net) },
        { idx: 4, value: discountCell },
        { idx: 5, value: isOptional ? `(${formatEur(item.total_net)})` : formatEur(item.total_net) },
      ];
      doc.font('Helvetica').fontSize(10).fillColor('#000000');
      for (const cell of cells) {
        doc.text(cell.value, colX[cell.idx] + 3, dataY + 4, {
          width: colWidths[cell.idx] - 6,
          align: dataAligns[cell.idx],
          lineBreak: false,
        });
      }
      dataY += dynamicRowHeight;
    }

    // Abschlusslinie Tabelle
    doc.save()
      .moveTo(marginLeft, dataY)
      .lineTo(pageWidth - marginRight, dataY)
      .lineWidth(0.5)
      .strokeColor('#CCCCCC')
      .stroke()
      .restore();

    // --- Summen-Block ---
    let sumY = dataY + 14;
    const sumLabelX = marginLeft + usableWidth * 0.48;
    const sumValueX = marginLeft + usableWidth * 0.78;
    const sumValueWidth = pageWidth - marginRight - sumValueX;

    // Rabatt-Betrag berechnen (Spalte discount_total existiert nicht — aus value/type rechnen).
    // quote.subtotal_net ist die Items-Summe VOR Rabatt-Abzug (siehe updateQuoteTotals).
    const discountValue = Number(quote.discount_value ?? 0);
    let discountTotal = 0;
    if (discountValue > 0) {
      discountTotal = quote.discount_type === '€'
        ? Math.min(discountValue, quote.subtotal_net)
        : quote.subtotal_net * (discountValue / 100);
    }
    const netAfterDiscount = Math.max(0, quote.subtotal_net - discountTotal);

    // MwSt nach Steuersatz gruppieren (anteilig nach Rabatt skaliert).
    // Optionale Positionen zaehlen NICHT in die Hauptsumme — daher hier ausschliessen,
    // sonst summiert die ausgewiesene MwSt nicht zur Angebotssumme brutto.
    const ratio = quote.subtotal_net > 0 ? netAfterDiscount / quote.subtotal_net : 1;
    const taxGroups: Map<number, number> = new Map();
    for (const item of items) {
      if (item.is_optional === 1) continue;
      const tax = item.total_net * ratio * (item.tax_rate / 100);
      taxGroups.set(item.tax_rate, (taxGroups.get(item.tax_rate) ?? 0) + tax);
    }

    doc.font('Helvetica').fontSize(10).fillColor('#000000');

    // Rabatt-Block: nur wenn discountTotal > 0
    if (discountTotal > 0) {
      // Zwischensumme vor Rabatt
      doc.text('Zwischensumme (netto):', sumLabelX, sumY, { width: sumValueX - sumLabelX - 6, align: 'left' });
      doc.text(formatEur(quote.subtotal_net), sumValueX, sumY, { width: sumValueWidth, align: 'right' });
      sumY = doc.y + 2;

      // Rabatt-Label aufbauen
      let discountLabel: string;
      if (quote.discount_description && String(quote.discount_description).trim()) {
        discountLabel = `Rabatt (${String(quote.discount_description).trim()}):`;
      } else if (quote.discount_type === '%') {
        discountLabel = `Rabatt ${discountValue} %:`;
      } else {
        discountLabel = 'Rabatt (Pauschal):';
      }

      doc.text(discountLabel, sumLabelX, sumY, { width: sumValueX - sumLabelX - 6, align: 'left' });
      doc.text(`-${formatEur(discountTotal)}`, sumValueX, sumY, { width: sumValueWidth, align: 'right' });
      sumY = doc.y + 2;

      // Subtile Trennlinie zwischen Rabatt und Nettosumme
      doc.save()
        .moveTo(sumLabelX, sumY + 1)
        .lineTo(pageWidth - marginRight, sumY + 1)
        .lineWidth(0.3)
        .strokeColor('#DDDDDD')
        .stroke()
        .restore();
      sumY += 4;
    }

    // Nettosumme — bei Rabatt: nach Abzug; sonst: Items-Summe
    doc.text('Nettosumme:', sumLabelX, sumY, { width: sumValueX - sumLabelX - 6, align: 'left' });
    doc.text(formatEur(netAfterDiscount), sumValueX, sumY, { width: sumValueWidth, align: 'right' });
    sumY = doc.y + 2;

    for (const [rate, taxAmt] of taxGroups) {
      doc.text(`Umsatzsteuer ${rate} %:`, sumLabelX, sumY, { width: sumValueX - sumLabelX - 6, align: 'left' });
      doc.text(formatEur(taxAmt), sumValueX, sumY, { width: sumValueWidth, align: 'right' });
      sumY = doc.y + 2;
    }

    // Trennlinie vor Brutto
    doc.save()
      .moveTo(sumLabelX, sumY + 2)
      .lineTo(pageWidth - marginRight, sumY + 2)
      .lineWidth(0.5)
      .strokeColor('#000000')
      .stroke()
      .restore();
    sumY += 8;

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
    doc.text('Angebotssumme brutto:', sumLabelX, sumY, { width: sumValueX - sumLabelX - 6, align: 'left' });
    doc.text(formatEur(quote.total_gross), sumValueX, sumY, { width: sumValueWidth, align: 'right' });

    // Summe optionaler Positionen brutto — nur wenn > 0
    if (quote.optional_total_gross > 0) {
      sumY = doc.y + 10;
      doc.font('Helvetica').fontSize(10).fillColor('#000000');
      doc.text('Summe optionaler Positionen brutto:', sumLabelX, sumY, { width: sumValueX - sumLabelX - 6, align: 'left' });
      doc.text(formatEur(quote.optional_total_gross), sumValueX, sumY, { width: sumValueWidth, align: 'right' });
    }

    // --- Hinweise-Block (notes) ---
    // Falls vorhanden, vor Fusstext anzeigen.
    // internal_notes wird NIE im PDF gerendert (rein interne Verwendung).
    if (quote.notes && String(quote.notes).trim()) {
      doc.moveDown(1);
      const notesHeadY = doc.y + 12;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000')
        .text('Hinweise:', marginLeft, notesHeadY);
      doc.font('Helvetica').fontSize(9).fillColor('#000000')
        .text(String(quote.notes), marginLeft, doc.y + 4, { width: usableWidth, lineGap: 3 });
    }

    // --- Fußtext ---
    let footerTextY = doc.y + 20;
    const placeholderVarsFt: Record<string, string> = {
      gueltig_bis: formatDateDE(quote.valid_until),
      valid_until: formatDateDE(quote.valid_until),
    };

    // quote.footer_text: null → Settings-Default, '' → kein Fußtext, sonst → eigener Text
    let footerContent: string;
    if (quote.footer_text === null || quote.footer_text === undefined) {
      const defaultFooterRow = db.prepare("SELECT value FROM dj_settings WHERE key = 'default_footer_text'").get() as { value: string } | undefined;
      footerContent = replacePlaceholders(
        defaultFooterRow?.value ?? `Dieses Angebot ist freibleibend und g\u00fcltig bis ${formatDateDE(quote.valid_until)}.`,
        placeholderVarsFt
      );
    } else {
      footerContent = replacePlaceholders(quote.footer_text, placeholderVarsFt);
    }

    if (footerContent) {
      doc.font('Helvetica').fontSize(10).fillColor('#000000')
        .text(footerContent, marginLeft, footerTextY, { width: usableWidth, lineGap: 4 });
    }

    // --- Mit freundlichen Gruessen ---
    const signatureY = doc.y + 18;
    doc.font('Helvetica').fontSize(10).fillColor('#000000')
      .text('Mit freundlichen Grüßen', marginLeft, signatureY, { width: usableWidth, lineBreak: false });
    doc.text('Benjamin Zimmermann', marginLeft, doc.y + 2, { width: usableWidth, lineBreak: false });

    // Footer + Logo rueckwirkend auf alle gebufferten Seiten setzen
    const { count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i++) {
      doc.switchToPage(i);
      if (i > 0) renderLogo(); // Seite 1 hat das Logo bereits, Folgeseiten brauchen es neu
      renderFooter(doc, i + 1, count);
    }

    doc.flushPages();
    doc.end();
  });
}

// ── Platzhalter für Phase 2 ───────────────────────────────────────────────────

export async function generateInvoicePdf(_invoiceId: number, number: string): Promise<{ path: string; hash: string }> {
  ensureDir(PDF_ARCHIVE_DIR);
  // TODO Phase 2: vollständiges PDF-Layout nach RECHNUNGS_TEMPLATE.md
  const placeholder = Buffer.from(`Rechnung ${number} (PDF-Generierung folgt in Phase 2)`);
  const filePath = path.join(PDF_ARCHIVE_DIR, `${number.replace(/[^A-Z0-9-]/gi, '_')}.pdf`);
  fs.writeFileSync(filePath, placeholder);
  const hash = crypto.createHash('sha256').update(placeholder).digest('hex');
  return { path: filePath, hash };
}

export async function generateQuotePdf(_quoteId: number, number: string): Promise<{ path: string; hash: string }> {
  ensureDir(QUOTE_ARCHIVE_DIR);
  // TODO Phase 2: vollständiges PDF-Layout
  const placeholder = Buffer.from(`Angebot ${number} (PDF-Generierung folgt in Phase 2)`);
  const filePath = path.join(QUOTE_ARCHIVE_DIR, `${number.replace(/[^A-Z0-9-]/gi, '_')}.pdf`);
  fs.writeFileSync(filePath, placeholder);
  const hash = crypto.createHash('sha256').update(placeholder).digest('hex');
  return { path: filePath, hash };
}

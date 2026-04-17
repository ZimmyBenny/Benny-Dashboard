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

function renderFooter(doc: PDFKit.PDFDocument) {
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
  const lineH = 13;

  // 3. 1pt graue Trennlinie (unverändert)
  doc.save()
    .moveTo(mL, footerY)
    .lineTo(pageWidth - mR, footerY)
    .lineWidth(1)
    .strokeColor('#CCCCCC')
    .stroke()
    .restore();

  // 4. 4 Spalten rendern, Zeile für Zeile aus \n-getrennten Strings
  const colWidths = [usableWidth * 0.24, usableWidth * 0.24, usableWidth * 0.22, usableWidth * 0.30];
  doc.save().font('Helvetica').fontSize(8).fillColor('#666666');

  let colX = mL;
  for (let i = 0; i < 4; i++) {
    const lines = cols[i].split('\n').filter(l => l.trim());
    const w = colWidths[i] - (i < 3 ? 4 : 0); // 4pt Gutter zwischen Spalten, Spalte 4 nutzt volle Breite
    lines.forEach((line, idx) => {
      doc.text(line, colX, footerY + 8 + idx * lineH, { width: w, lineBreak: false });
    });
    colX += colWidths[i];
  }

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
    // --- Logo (oben rechts, über der Absenderzeile) ---
    const logoRow = db.prepare("SELECT value FROM dj_settings WHERE key = 'logo_path'").get() as { value: string } | undefined;
    if (logoRow?.value) {
      const absLogoPath = path.join(process.cwd(), logoRow.value);
      if (fs.existsSync(absLogoPath) && path.extname(absLogoPath).toLowerCase() !== '.svg') {
        try {
          doc.image(absLogoPath, pageWidth - marginRight - 120, 10, { fit: [120, 55], align: 'right' });
        } catch {
          // Logo nicht renderbar — graceful skip
        }
      }
    }

    // --- Absenderzeile ---
    const senderText = `${company.name} \u00B7 ${company.address} \u00B7 ${company.zip} ${company.city}`;
    doc.font('Helvetica').fontSize(8).fillColor('#666666')
      .text(senderText, marginLeft, 71, { width: usableWidth * 0.58, lineBreak: false });
    const senderBottom = 85;
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
    if (event?.title) metaRows.push(['Referenz:', event.title]);
    if (contact?.customer_number) metaRows.push(['Kundennummer:', contact.customer_number]);
    metaRows.push(['Ansprechpartner:', 'Benjamin Zimmermann']);

    doc.font('Helvetica').fontSize(10).fillColor('#000000');
    for (const [label, value] of metaRows) {
      doc.text(label, metaX, metaY, { width: metaLabelWidth, continued: false });
      doc.text(value, metaX + metaLabelWidth, metaY, { width: metaValueWidth, align: 'right' });
      metaY = doc.y;
    }

    // --- Titelzeile ---
    const blockBottom = Math.max(recipientY, metaY);
    const titleY = blockBottom + 20;
    const titleText = quote.number
      ? `Angebot Nr. ${quote.number}`
      : 'Angebot (Entwurf)';

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#000000')
      .text(titleText, marginLeft, titleY, { width: usableWidth });

    // --- Kopftext ---
    let currentY = doc.y + 10;
    if (quote.header_text) {
      const placeholderVars: Record<string, string> = {
        vorname: contact?.first_name ?? '',
        nachname: contact?.last_name ?? '',
        anrede: contact?.salutation ?? '',
        eventdatum: event?.event_date ? formatDateDE(event.event_date) : '',
        gueltig_bis: formatDateDE(quote.valid_until),
      };
      const headerText = replacePlaceholders(quote.header_text, placeholderVars);
      doc.font('Helvetica').fontSize(10).fillColor('#000000')
        .text(headerText, marginLeft, currentY, { width: usableWidth, lineGap: 4 });
      currentY = doc.y + 10;
    }

    // --- Positionstabelle ---
    // Spaltenbreiten (relativ zu usableWidth ~467pt)
    const colWidths = [
      usableWidth * 0.08,   // Pos
      usableWidth * 0.42,   // Beschreibung
      usableWidth * 0.12,   // Menge
      usableWidth * 0.19,   // Einzelpreis
      usableWidth * 0.19,   // Gesamt
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
    const headers = ['Pos.', 'Beschreibung', 'Menge', 'Einzelpreis', 'Gesamt'];
    const headerAligns: Array<'center' | 'left' | 'right'> = ['center', 'left', 'right', 'right', 'right'];

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
    const dataAligns: Array<'center' | 'left' | 'right'> = ['center', 'left', 'right', 'right', 'right'];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      // Seitenumbruch prüfen
      if (dataY + rowHeight > doc.page.height - 120) {
        doc.addPage();
        dataY = 71;
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
      const rowData = [
        String(item.position),
        item.description,
        new Intl.NumberFormat('de-DE').format(item.quantity),
        formatEur(item.price_net),
        formatEur(item.total_net),
      ];
      for (let i = 0; i < rowData.length; i++) {
        doc.text(rowData[i], colX[i] + 3, dataY + 4, {
          width: colWidths[i] - 6,
          align: dataAligns[i],
          lineBreak: false,
        });
      }
      dataY += rowHeight;
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

    // MwSt nach Steuersatz gruppieren
    const taxGroups: Map<number, number> = new Map();
    for (const item of items) {
      const tax = item.total_net * (item.tax_rate / 100);
      taxGroups.set(item.tax_rate, (taxGroups.get(item.tax_rate) ?? 0) + tax);
    }

    doc.font('Helvetica').fontSize(10).fillColor('#000000');
    doc.text('Nettosumme:', sumLabelX, sumY, { width: sumValueX - sumLabelX - 6, align: 'left' });
    doc.text(formatEur(quote.subtotal_net), sumValueX, sumY, { width: sumValueWidth, align: 'right' });
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

    // Footer rückwirkend auf alle gebufferten Seiten setzen (kein pageAdded-Handler nötig)
    const { count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i++) {
      doc.switchToPage(i);
      renderFooter(doc);
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

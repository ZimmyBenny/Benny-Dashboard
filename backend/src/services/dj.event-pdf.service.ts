// DJ-Event PDF-Export (User-Decision 2026-05-27)
// Schlanke Variante des Angebots-PDF-Layouts — exportiert eine Anfrage/Event mit
// allen Details (Kunde, Veranstaltung, Vorgespraech, Notizen, Anhaenge) als PDF,
// damit der DJ sie z.B. an einen Kollegen weiterleiten kann.

import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import db from '../db/connection';

interface EventRow {
  id: number;
  customer_id: number | null;
  customer_freetext: string | null;
  title: string | null;
  event_type: string;
  event_type_other: string | null;
  event_date: string | null;
  time_start: string | null;
  time_end: string | null;
  guests: number | null;
  status: string;
  notes: string | null;
  source_channel: string | null;
  venue_name: string | null;
  venue_street: string | null;
  venue_zip: string | null;
  venue_city: string | null;
  vorgespraech_datum: string | null;
  vorgespraech_plz: string | null;
  vorgespraech_ort: string | null;
  vorgespraech_notizen: string | null;
  calendar_uid: string | null;
  created_at: string;
}

interface ContactRow {
  id: number;
  contact_kind: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  customer_number: string | null;
  email: string | null;
  phone: string | null;
}

interface AttachmentRow {
  original_name: string;
  size_bytes: number | null;
  uploaded_at: string;
}

interface CompanySettings {
  name: string;
  company?: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  hochzeit: 'Hochzeit',
  firmen_event: 'Firmen-Event',
  club_bar: 'Club / Bar',
  geburtstag: 'Geburtstag',
  festival: 'Polterabend',
  weihnachtsfeier: 'Weihnachtsfeier',
  sonstige: 'Sonstiges',
};

const STATUS_LABELS: Record<string, string> = {
  anfrage: 'Anfrage',
  neu: 'Neu',
  vorgespraech_vereinbart: 'Vorgespräch vereinbart',
  angebot_gesendet: 'Angebot gesendet',
  bestaetigt: 'Bestätigt',
  abgeschlossen: 'Abgeschlossen',
  abgesagt: 'Abgesagt',
};

function formatDateDE(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = iso.slice(0, 10).split('-');
  if (d.length !== 3) return iso;
  return `${d[2]}.${d[1]}.${d[0]}`;
}

function loadCompany(): CompanySettings {
  const row = db.prepare("SELECT value FROM dj_settings WHERE key = 'company'").get() as { value: string } | undefined;
  const raw = row ? (JSON.parse(row.value) as Record<string, unknown>) : null;
  return raw
    ? {
        name: String(raw.name ?? 'Benjamin Zimmermann'),
        company: raw.company ? String(raw.company) : undefined,
        address: String(raw.address ?? raw.street ?? ''),
        zip: String(raw.zip ?? ''),
        city: String(raw.city ?? ''),
        country: String(raw.country ?? 'Deutschland'),
        phone: String(raw.phone ?? ''),
        email: String(raw.email ?? ''),
        website: String(raw.website ?? ''),
      }
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
      };
}

export async function generateEventPdf(eventId: number): Promise<Buffer> {
  const event = db.prepare(
    'SELECT * FROM dj_events WHERE id = ? AND deleted_at IS NULL'
  ).get(eventId) as EventRow | undefined;
  if (!event) throw new Error(`Event ${eventId} nicht gefunden`);

  const contact = event.customer_id
    ? (db.prepare(
        `SELECT id, contact_kind, salutation, first_name, last_name, organization_name, customer_number,
                (SELECT value FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS email,
                (SELECT value FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS phone
         FROM contacts c WHERE id = ?`
      ).get(event.customer_id) as ContactRow | undefined)
    : undefined;

  const attachments = db.prepare(
    'SELECT original_name, size_bytes, uploaded_at FROM dj_event_attachments WHERE event_id = ? ORDER BY uploaded_at DESC'
  ).all(eventId) as AttachmentRow[];

  const company = loadCompany();

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 71, bottom: 90, left: 71, right: 57 },
      autoFirstPage: true,
      bufferPages: true,
      info: { Title: `Anfrage Event #${event.id}`, Author: company.name },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const marginLeft = 71;
    const marginRight = 57;
    const pageWidth = doc.page.width;
    const usableWidth = pageWidth - marginLeft - marginRight;

    // Logo
    const logoRow = db.prepare("SELECT value FROM dj_settings WHERE key = 'logo_path'").get() as { value: string } | undefined;
    const absLogoPath = logoRow?.value ? path.join(process.cwd(), logoRow.value) : null;
    if (absLogoPath && fs.existsSync(absLogoPath) && path.extname(absLogoPath).toLowerCase() !== '.svg') {
      try {
        doc.image(absLogoPath, pageWidth - marginRight - 170, 30, { fit: [170, 80], align: 'right' });
      } catch { /* ignore */ }
    }

    // Absenderzeile
    const senderText = `${company.name} · ${company.address} · ${company.zip} ${company.city}`;
    doc.font('Helvetica').fontSize(8).fillColor('#666666')
      .text(senderText, marginLeft, 100, { width: usableWidth * 0.58, lineBreak: false });
    doc.moveTo(marginLeft, 115).lineTo(pageWidth - marginRight, 115).lineWidth(0.5).strokeColor('#999999').stroke();

    // Empfaenger-Block + Meta-Block
    const recipientY0 = 135;
    const metaX = marginLeft + usableWidth * 0.55;
    const metaWidth = usableWidth * 0.45;

    const recipientLines: string[] = [];
    if (contact) {
      if (contact.contact_kind === 'organization') {
        if (contact.organization_name) recipientLines.push(contact.organization_name);
      } else {
        const nameParts = [contact.salutation, contact.first_name, contact.last_name].filter(Boolean) as string[];
        if (nameParts.length) recipientLines.push(nameParts.join(' '));
        if (contact.organization_name) recipientLines.push(contact.organization_name);
      }
      if (contact.email) recipientLines.push(contact.email);
      if (contact.phone) recipientLines.push(contact.phone);
    } else if (event.customer_freetext) {
      // Kein Kontakt verknuepft -> Freitext zeigen
      recipientLines.push(event.customer_freetext);
    } else {
      recipientLines.push('(Kein Kunde verknüpft)');
    }

    doc.font('Helvetica').fontSize(11).fillColor('#000000');
    let ry = recipientY0;
    for (const line of recipientLines) {
      doc.text(line, marginLeft, ry, { width: metaX - marginLeft - 20 });
      ry = doc.y;
    }

    // Meta
    const metaLabelWidth = 100;
    const metaValueWidth = metaWidth - metaLabelWidth;
    let metaY = recipientY0;
    const metaRows: Array<[string, string]> = [
      ['Anfrage-Nr.:', String(event.id)],
      ['Status:', STATUS_LABELS[event.status] ?? event.status],
      ['Eingang:', formatDateDE(event.created_at)],
    ];
    if (event.source_channel) metaRows.push(['Eingangskanal:', event.source_channel]);
    if (contact?.customer_number) metaRows.push(['Kundennummer:', contact.customer_number]);

    doc.font('Helvetica').fontSize(10).fillColor('#000000');
    for (const [label, value] of metaRows) {
      doc.text(label, metaX, metaY, { width: metaLabelWidth, continued: false });
      doc.text(value, metaX + metaLabelWidth, metaY, { width: metaValueWidth, align: 'right' });
      metaY = doc.y;
    }

    // Titelzeile
    const blockBottom = Math.max(ry, metaY);
    const titleY = blockBottom + 50;
    const typLabel = event.event_type === 'sonstige' && event.event_type_other
      ? `Sonstiges: ${event.event_type_other}`
      : (EVENT_TYPE_LABELS[event.event_type] ?? event.event_type);
    const titleText = event.title?.trim() || `${typLabel}${event.event_date ? ' am ' + formatDateDE(event.event_date) : ''}`;

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#000000')
      .text(titleText, marginLeft, titleY, { width: usableWidth });

    let y = doc.y + 25;

    // Sektion: Veranstaltung
    const drawSectionHeader = (label: string) => {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000')
        .text(label, marginLeft, y, { width: usableWidth });
      doc.moveTo(marginLeft, doc.y + 2).lineTo(pageWidth - marginRight, doc.y + 2)
        .lineWidth(0.4).strokeColor('#cccccc').stroke();
      y = doc.y + 8;
    };

    const drawRow = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#444444')
        .text(label, marginLeft, y, { width: 140, continued: false });
      doc.font('Helvetica').fontSize(10).fillColor('#000000')
        .text(value || '—', marginLeft + 140, y, { width: usableWidth - 140 });
      y = doc.y + 4;
    };

    drawSectionHeader('Veranstaltung');
    drawRow('Typ:', typLabel);
    drawRow('Datum:', formatDateDE(event.event_date));
    if (event.time_start || event.time_end) {
      const t = `${event.time_start ?? '—'} – ${event.time_end ?? '—'}`;
      drawRow('Zeit:', t);
    }
    if (event.guests != null) drawRow('Gäste:', String(event.guests));
    drawRow('Kalender:', event.calendar_uid ? 'Eingetragen' : 'Noch nicht eingetragen');
    y += 10;

    // Sektion: Location
    if (event.venue_name || event.venue_street || event.venue_zip || event.venue_city) {
      drawSectionHeader('Location');
      if (event.venue_name) drawRow('Name:', event.venue_name);
      if (event.venue_street) drawRow('Straße:', event.venue_street);
      if (event.venue_zip || event.venue_city) {
        drawRow('PLZ / Ort:', `${event.venue_zip ?? ''} ${event.venue_city ?? ''}`.trim());
      }
      y += 10;
    }

    // Sektion: Vorgespraech
    if (event.vorgespraech_datum || event.vorgespraech_ort || event.vorgespraech_notizen) {
      drawSectionHeader('Vorgespräch');
      if (event.vorgespraech_datum) drawRow('Datum:', formatDateDE(event.vorgespraech_datum));
      if (event.vorgespraech_plz || event.vorgespraech_ort) {
        drawRow('Ort:', `${event.vorgespraech_plz ?? ''} ${event.vorgespraech_ort ?? ''}`.trim());
      }
      if (event.vorgespraech_notizen) {
        doc.font('Helvetica').fontSize(10).fillColor('#000000')
          .text(event.vorgespraech_notizen, marginLeft, y, { width: usableWidth, lineGap: 2 });
        y = doc.y + 4;
      }
      y += 10;
    }

    // Sektion: Notizen
    if (event.notes && event.notes.trim()) {
      drawSectionHeader('Notizen');
      doc.font('Helvetica').fontSize(10).fillColor('#000000')
        .text(event.notes, marginLeft, y, { width: usableWidth, lineGap: 2 });
      y = doc.y + 14;
    }

    // Sektion: Anhaenge
    if (attachments.length > 0) {
      drawSectionHeader(`Anhänge (${attachments.length})`);
      doc.font('Helvetica').fontSize(10).fillColor('#000000');
      for (const a of attachments) {
        const size = a.size_bytes != null ? ` (${Math.round(a.size_bytes / 1024)} KB)` : '';
        doc.text(`• ${a.original_name}${size}`, marginLeft, y, { width: usableWidth });
        y = doc.y + 2;
      }
      y += 6;
    }

    // Footer einfach: Company-Info
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const footerY = doc.page.height - 65;
      doc.font('Helvetica').fontSize(8).fillColor('#888888');
      const footerLine1 = `${company.name} · ${company.address} · ${company.zip} ${company.city}`;
      const footerLine2 = [company.phone, company.email, company.website].filter(Boolean).join(' · ');
      doc.text(footerLine1, marginLeft, footerY, { width: usableWidth, align: 'center', lineBreak: false });
      doc.text(footerLine2, marginLeft, footerY + 11, { width: usableWidth, align: 'center', lineBreak: false });
      doc.text(`Seite ${i + 1} von ${range.count}`, marginLeft, footerY + 26, { width: usableWidth, align: 'center', lineBreak: false });
    }

    doc.end();
  });
}

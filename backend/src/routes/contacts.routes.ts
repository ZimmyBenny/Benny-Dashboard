import { Router } from 'express';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import db from '../db/connection';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// Haversine-Distanz in km
// ---------------------------------------------------------------------------
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Naechste Kundennummer (Transaction: lesen + inkrementieren)
// ---------------------------------------------------------------------------
function getNextCustomerNumber(): string {
  const getNext = db.transaction(() => {
    const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'contact_next_number'`).get() as { value: string } | undefined;
    const current = parseInt(row?.value ?? '1051', 10);
    const next = current + 1;
    db.prepare(`UPDATE app_settings SET value = ?, updated_at = datetime('now') WHERE key = 'contact_next_number'`).run(String(next));
    return String(current);
  });
  return getNext();
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen: Subtabellen laden
// ---------------------------------------------------------------------------
function loadContactDetail(id: number) {
  const contact = db.prepare(`SELECT * FROM contacts WHERE id = ?`).get(id);
  if (!contact) return null;
  const addresses = db.prepare(`SELECT * FROM contact_addresses WHERE contact_id = ? ORDER BY is_primary DESC`).all(id);
  const emails = db.prepare(`SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY is_primary DESC`).all(id);
  const phones = db.prepare(`SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY is_primary DESC`).all(id);
  const websites = db.prepare(`SELECT * FROM contact_websites WHERE contact_id = ? ORDER BY is_primary DESC`).all(id);
  const notes = db.prepare(`SELECT * FROM contact_notes WHERE contact_id = ? ORDER BY created_at DESC`).all(id);
  const activity_log = db.prepare(`SELECT * FROM contact_activity_log WHERE contact_id = ? ORDER BY created_at DESC LIMIT 50`).all(id);

  // Entfernung berechnen
  let distance_km: number | null = null;
  const primaryAddr = (addresses as Array<{ is_primary: number; latitude: number | null; longitude: number | null }>).find(a => a.is_primary === 1) ?? (addresses as Array<{ latitude: number | null; longitude: number | null }>)[0];
  if (primaryAddr?.latitude != null && primaryAddr?.longitude != null) {
    const homeLat = db.prepare(`SELECT value FROM app_settings WHERE key = 'home_latitude'`).get() as { value: string } | undefined;
    const homeLon = db.prepare(`SELECT value FROM app_settings WHERE key = 'home_longitude'`).get() as { value: string } | undefined;
    if (homeLat && homeLon) {
      const km = haversineKm(parseFloat(homeLat.value), parseFloat(homeLon.value), primaryAddr.latitude, primaryAddr.longitude);
      distance_km = Math.round(km * 10) / 10;
    }
  }

  return { ...contact as object, addresses, emails, phones, websites, notes, activity_log, distance_km };
}

// ---------------------------------------------------------------------------
// GET /api/contacts — Liste mit Filtern
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const { search, type, area, city, postal_code, country, tags, archived, page, limit } = req.query as Record<string, string | undefined>;

  const pageNum = Math.max(1, parseInt(page ?? '1', 10));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit ?? '50', 10)));
  const offset = (pageNum - 1) * limitNum;
  const isArchived = archived === '1' ? 1 : 0;

  let where = `WHERE c.is_archived = ?`;
  const params: (string | number)[] = [isArchived];

  if (search) {
    const like = `%${search}%`;
    where += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.organization_name LIKE ? OR c.customer_number LIKE ? OR c.tags LIKE ? OR c.description LIKE ?)`;
    params.push(like, like, like, like, like, like);
  }
  if (type) { where += ` AND c.type = ?`; params.push(type); }
  if (area) { where += ` AND c.area = ?`; params.push(area); }
  if (city) { where += ` AND a.city LIKE ?`; params.push(`%${city}%`); }
  if (postal_code) { where += ` AND a.postal_code = ?`; params.push(postal_code); }
  if (country) { where += ` AND a.country = ?`; params.push(country); }
  if (tags) { where += ` AND c.tags LIKE ?`; params.push(`%${tags}%`); }

  const baseSql = `
    FROM contacts c
    LEFT JOIN contact_addresses a ON a.contact_id = c.id AND a.is_primary = 1
    LEFT JOIN contact_emails e ON e.contact_id = c.id AND e.is_primary = 1
    LEFT JOIN contact_phones p ON p.contact_id = c.id AND p.is_primary = 1
    ${where}
  `;

  const totalRow = db.prepare(`SELECT COUNT(DISTINCT c.id) AS total ${baseSql}`).get(...params) as { total: number };
  const total = totalRow.total;

  const rows = db.prepare(`
    SELECT DISTINCT c.*,
      a.city AS primary_city,
      e.email AS primary_email,
      p.phone AS primary_phone
    ${baseSql}
    ORDER BY
      CASE WHEN c.contact_kind = 'organization' THEN COALESCE(c.organization_name, '') ELSE COALESCE(c.last_name, '') END ASC
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset);

  res.json({ data: rows, total, page: pageNum, limit: limitNum });
});

// ---------------------------------------------------------------------------
// GET /api/contacts/next-number
// ---------------------------------------------------------------------------
router.get('/next-number', (_req, res) => {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = 'contact_next_number'`).get() as { value: string } | undefined;
  res.json({ next_number: row?.value ?? '1051' });
});

// ---------------------------------------------------------------------------
// GET /api/contacts/export/csv — CSV-Export (Sevdesk-Format)
// ---------------------------------------------------------------------------
router.get('/export/csv', (req, res) => {
  const { search, type, area, archived } = req.query as Record<string, string | undefined>;
  const isArchived = archived === '1' ? 1 : 0;

  let where = `WHERE c.is_archived = ?`;
  const params: (string | number)[] = [isArchived];

  if (search) {
    const like = `%${search}%`;
    where += ` AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.organization_name LIKE ? OR c.customer_number LIKE ?)`;
    params.push(like, like, like, like);
  }
  if (type) { where += ` AND c.type = ?`; params.push(type); }
  if (area) { where += ` AND c.area = ?`; params.push(area); }

  const contacts = db.prepare(`SELECT * FROM contacts c ${where} ORDER BY id ASC`).all(...params) as Array<Record<string, unknown>>;

  const headers = [
    'Kunden-Nr.', 'Anrede', 'Titel', 'Nachname', 'Vorname', 'Organisation', 'Namenszusatz', 'Position',
    'Kategorie', 'IBAN', 'BIC', 'UmSt.-ID', 'Strasse', 'PLZ', 'Ort', 'Land', 'Adresse-Kategorie',
    'Telefon', 'Telefon-Kategorie', 'Mobil', 'Fax', 'E-Mail', 'E-Mail-Kategorie',
    'Webseite', 'Webseite-Kategorie', 'Beschreibung', 'Geburtstag', 'Tags',
    'Debitoren-Nr.', 'Kreditoren-Nr.', 'Steuernummer', 'Skonto Tage', 'Skonto Prozent',
    'Zahlungsziel Tage', 'Kundenrabatt',
  ];

  function esc(v: unknown): string {
    if (v == null || v === '') return '';
    const s = String(v);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }

  const lines: string[] = ['\uFEFF' + headers.join(';')];

  for (const c of contacts) {
    const addr = db.prepare(`SELECT * FROM contact_addresses WHERE contact_id = ? AND is_primary = 1 LIMIT 1`).get(c['id'] as number) as Record<string, unknown> | undefined;
    const email = db.prepare(`SELECT * FROM contact_emails WHERE contact_id = ? AND is_primary = 1 LIMIT 1`).get(c['id'] as number) as Record<string, unknown> | undefined;
    const phone = db.prepare(`SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1`).get(c['id'] as number) as Record<string, unknown> | undefined;
    const mobil = db.prepare(`SELECT * FROM contact_phones WHERE contact_id = ? AND label = 'Mobil' LIMIT 1`).get(c['id'] as number) as Record<string, unknown> | undefined;
    const fax = db.prepare(`SELECT * FROM contact_phones WHERE contact_id = ? AND label = 'Fax' LIMIT 1`).get(c['id'] as number) as Record<string, unknown> | undefined;
    const website = db.prepare(`SELECT * FROM contact_websites WHERE contact_id = ? AND is_primary = 1 LIMIT 1`).get(c['id'] as number) as Record<string, unknown> | undefined;

    const row = [
      esc(c['customer_number']), esc(c['salutation']), esc(c['title']),
      esc(c['last_name']), esc(c['first_name']), esc(c['organization_name']),
      esc(c['suffix']), esc(c['position']), esc(c['type']),
      esc(c['iban']), esc(c['bic']), esc(c['vat_id']),
      esc(addr?.['street']), esc(addr?.['postal_code']), esc(addr?.['city']),
      esc(addr?.['country'] ?? 'Deutschland'), esc(addr?.['label']),
      esc(phone?.['phone']), esc(phone?.['label']),
      esc(mobil?.['phone']), esc(fax?.['phone']),
      esc(email?.['email']), esc(email?.['label']),
      esc(website?.['url']), esc(website?.['label']),
      esc(c['description']), esc(c['birthday']), esc(c['tags']),
      esc(c['debtor_number']), esc(c['creditor_number']), esc(c['tax_number']),
      esc(c['discount_days']), esc(c['discount_percent']),
      esc(c['payment_term_days']), esc(c['customer_discount']),
    ];
    lines.push(row.join(';'));
  }

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="kontakte-export-${date}.csv"`);
  res.send(lines.join('\r\n'));
});

// ---------------------------------------------------------------------------
// POST /api/contacts/import/csv — CSV-Import (Sevdesk-Format)
// ---------------------------------------------------------------------------
router.post('/import/csv', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Keine Datei hochgeladen' });
    return;
  }

  // UTF-8 BOM entfernen falls vorhanden
  let raw = req.file.buffer.toString('utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);

  const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    res.status(400).json({ error: 'CSV leer oder nur Kopfzeile' });
    return;
  }

  function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ';' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseCsvLine(lines[0]);
  const col = (row: string[], name: string): string => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] ?? '').trim() : '';
  };

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Alle Zeilen nach Kundennummer gruppieren (mehrere Zeilen = eine Kundennummer)
  const groups: Map<string, string[][]> = new Map();
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const custNum = col(row, 'Kunden-Nr.') || `_row_${i}`;
    if (!groups.has(custNum)) groups.set(custNum, []);
    groups.get(custNum)!.push(row);
  }

  const insertContact = db.transaction((rows: string[][], custNum: string) => {
    const firstRow = rows[0];
    // Duplikat-Check
    if (custNum && !custNum.startsWith('_row_')) {
      const existing = db.prepare(`SELECT id FROM contacts WHERE customer_number = ?`).get(custNum);
      if (existing) { skipped++; return; }
    }

    const organisation = col(firstRow, 'Organisation');
    const lastName = col(firstRow, 'Nachname');
    const firstName = col(firstRow, 'Vorname');
    const contactKind = (organisation && !lastName && !firstName) ? 'organization' : 'person';

    const typeVal = col(firstRow, 'Kategorie') || 'Kunde';
    const birthday = col(firstRow, 'Geburtstag') || null;
    const tags = col(firstRow, 'Tags') || null;
    const description = col(firstRow, 'Beschreibung') || null;
    const iban = col(firstRow, 'IBAN') || null;
    const bic = col(firstRow, 'BIC') || null;
    const vatId = col(firstRow, 'UmSt.-ID') || null;
    const taxNumber = col(firstRow, 'Steuernummer') || null;
    const debtorNumber = col(firstRow, 'Debitoren-Nr.') || null;
    const creditorNumber = col(firstRow, 'Kreditoren-Nr.') || null;
    const leitwegId = col(firstRow, 'Leitweg-ID');
    const eInvoice = leitwegId ? 1 : 0;
    const discountDays = col(firstRow, 'Skonto Tage') ? parseInt(col(firstRow, 'Skonto Tage'), 10) : null;
    const discountPercent = col(firstRow, 'Skonto Prozent') ? parseFloat(col(firstRow, 'Skonto Prozent').replace(',', '.')) : null;
    const paymentTermDays = col(firstRow, 'Zahlungsziel Tage') ? parseInt(col(firstRow, 'Zahlungsziel Tage'), 10) : null;
    const customerDiscount = col(firstRow, 'Kundenrabatt') ? parseFloat(col(firstRow, 'Kundenrabatt').replace(',', '.')) : null;
    const suffix = col(firstRow, 'Namenszusatz') || null;
    const position = col(firstRow, 'Position') || null;
    const salutation = col(firstRow, 'Anrede') || null;
    const title = col(firstRow, 'Titel') || null;

    const result = db.prepare(`
      INSERT INTO contacts (
        contact_kind, type, area, customer_number, salutation, title,
        first_name, last_name, suffix, organization_name, position,
        debtor_number, creditor_number, e_invoice_default,
        iban, bic, vat_id, tax_number,
        discount_days, discount_percent, payment_term_days, customer_discount,
        birthday, description, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contactKind, typeVal, 'Sonstiges',
      custNum.startsWith('_row_') ? null : custNum,
      salutation, title,
      firstName || null, lastName || null,
      suffix, organisation || null, position,
      debtorNumber, creditorNumber, eInvoice,
      iban, bic, vatId, taxNumber,
      discountDays, discountPercent, paymentTermDays, customerDiscount,
      birthday, description, tags
    );

    const contactId = result.lastInsertRowid as number;

    // Activity Log
    db.prepare(`INSERT INTO contact_activity_log (contact_id, event_type, message) VALUES (?, 'created', 'Kontakt importiert')`).run(contactId);

    // Alle Zeilen der Gruppe: Adressen, Telefone, Emails, Webseiten
    const seenAddresses = new Set<string>();
    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();

    for (const row of rows) {
      // Adresse
      const street = col(row, 'Strasse');
      const plz = col(row, 'PLZ');
      const city = col(row, 'Ort');
      const country = col(row, 'Land') || 'Deutschland';
      const addrLabel = col(row, 'Adresse-Kategorie') || 'Rechnungsanschrift';
      const addrKey = `${street}|${plz}|${city}`;
      if ((street || plz || city) && !seenAddresses.has(addrKey)) {
        seenAddresses.add(addrKey);
        const isFirst = seenAddresses.size === 1 ? 1 : 0;
        db.prepare(`INSERT INTO contact_addresses (contact_id, street, postal_code, city, country, label, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(contactId, street || null, plz || null, city || null, country, addrLabel, isFirst);
      }

      // Telefon
      const phoneTel = col(row, 'Telefon');
      const phoneLabel = col(row, 'Telefon-Kategorie') || 'Arbeit';
      if (phoneTel && !seenPhones.has(phoneTel)) {
        seenPhones.add(phoneTel);
        const isPrimary = seenPhones.size === 1 ? 1 : 0;
        db.prepare(`INSERT INTO contact_phones (contact_id, phone, label, is_primary) VALUES (?, ?, ?, ?)`)
          .run(contactId, phoneTel, phoneLabel, isPrimary);
      }

      // Mobil
      const phoneMobil = col(row, 'Mobil');
      if (phoneMobil && !seenPhones.has(phoneMobil)) {
        seenPhones.add(phoneMobil);
        db.prepare(`INSERT INTO contact_phones (contact_id, phone, label, is_primary) VALUES (?, ?, 'Mobil', 0)`)
          .run(contactId, phoneMobil);
      }

      // Fax
      const phoneFax = col(row, 'Fax');
      if (phoneFax && !seenPhones.has(phoneFax)) {
        seenPhones.add(phoneFax);
        db.prepare(`INSERT INTO contact_phones (contact_id, phone, label, is_primary) VALUES (?, ?, 'Fax', 0)`)
          .run(contactId, phoneFax);
      }

      // Email
      const emailVal = col(row, 'E-Mail');
      const emailLabel = col(row, 'E-Mail-Kategorie') || 'Arbeit';
      if (emailVal && !seenEmails.has(emailVal)) {
        seenEmails.add(emailVal);
        const isPrimary = seenEmails.size === 1 ? 1 : 0;
        db.prepare(`INSERT INTO contact_emails (contact_id, email, label, is_primary) VALUES (?, ?, ?, ?)`)
          .run(contactId, emailVal, emailLabel, isPrimary);
      }

      // Webseite
      const websiteUrl = col(row, 'Webseite');
      const websiteLabel = col(row, 'Webseite-Kategorie') || 'Webseite';
      if (websiteUrl) {
        db.prepare(`INSERT INTO contact_websites (contact_id, url, label, is_primary) VALUES (?, ?, ?, 1)`)
          .run(contactId, websiteUrl, websiteLabel);
      }
    }

    imported++;
  });

  for (const [custNum, rows] of groups) {
    try {
      insertContact(rows, custNum);
    } catch (err) {
      errors.push(`Zeile ${custNum}: ${(err as Error).message}`);
    }
  }

  res.json({ imported, skipped, errors });
});

// ---------------------------------------------------------------------------
// GET /api/contacts/:id/export/pdf — PDF-Export Einzelkontakt
// ---------------------------------------------------------------------------
router.get('/:id/export/pdf', (req, res) => {
  const id = Number(req.params.id);
  const detail = loadContactDetail(id) as Record<string, unknown> | null;
  if (!detail) { res.status(404).json({ error: 'Kontakt nicht gefunden' }); return; }

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const name = detail['contact_kind'] === 'organization'
    ? String(detail['organization_name'] ?? 'Organisation')
    : `${detail['first_name'] ?? ''} ${detail['last_name'] ?? ''}`.trim();
  const custNum = detail['customer_number'] ? String(detail['customer_number']) : 'KD-?';
  const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="kontakt-${custNum}-${safeName}.pdf"`);
  doc.pipe(res);

  // Header
  doc.fontSize(20).font('Helvetica-Bold').text(name, { align: 'left' });
  doc.fontSize(10).font('Helvetica').fillColor('#666666').text(`Kundennummer: ${custNum}  |  Typ: ${detail['type']}  |  Bereich: ${detail['area']}`);
  doc.moveDown();
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke('#cccccc');
  doc.moveDown(0.5);

  doc.fontSize(12).font('Helvetica-Bold').fillColor('#000000').text('Kontaktdaten');
  doc.fontSize(10).font('Helvetica');
  const emails = detail['emails'] as Array<Record<string, unknown>>;
  const phones = detail['phones'] as Array<Record<string, unknown>>;
  const addresses = detail['addresses'] as Array<Record<string, unknown>>;
  const websites = detail['websites'] as Array<Record<string, unknown>>;

  if (emails.length > 0) doc.text(`E-Mail: ${emails.map(e => `${e['email']} (${e['label']})`).join(', ')}`);
  if (phones.length > 0) doc.text(`Telefon: ${phones.map(p => `${p['phone']} (${p['label']})`).join(', ')}`);
  if (websites.length > 0) doc.text(`Webseite: ${websites.map(w => w['url']).join(', ')}`);
  doc.moveDown();

  if (addresses.length > 0) {
    doc.fontSize(12).font('Helvetica-Bold').text('Adressen');
    doc.fontSize(10).font('Helvetica');
    for (const a of addresses) {
      const parts = [a['street'], `${a['postal_code'] ?? ''} ${a['city'] ?? ''}`.trim(), a['country']].filter(Boolean);
      doc.text(`${a['label']}: ${parts.join(', ')}`);
    }
    doc.moveDown();
  }

  // Finanzielle Daten
  const hasFinance = detail['iban'] || detail['bic'] || detail['vat_id'] || detail['tax_number'];
  if (hasFinance) {
    doc.fontSize(12).font('Helvetica-Bold').text('Zahlung & Konditionen');
    doc.fontSize(10).font('Helvetica');
    if (detail['iban']) doc.text(`IBAN: ${detail['iban']}`);
    if (detail['bic']) doc.text(`BIC: ${detail['bic']}`);
    if (detail['vat_id']) doc.text(`USt-ID: ${detail['vat_id']}`);
    if (detail['tax_number']) doc.text(`Steuernummer: ${detail['tax_number']}`);
    if (detail['payment_term_days']) doc.text(`Zahlungsziel: ${detail['payment_term_days']} Tage`);
    if (detail['discount_days']) doc.text(`Skonto: ${detail['discount_days']} Tage / ${detail['discount_percent']}%`);
    doc.moveDown();
  }

  if (detail['description']) {
    doc.fontSize(12).font('Helvetica-Bold').text('Beschreibung');
    doc.fontSize(10).font('Helvetica').text(String(detail['description']));
    doc.moveDown();
  }

  if (detail['tags']) {
    doc.fontSize(10).font('Helvetica').fillColor('#666666').text(`Tags: ${detail['tags']}`);
  }

  doc.end();
});

// ---------------------------------------------------------------------------
// GET /api/contacts/:id — Kontakt-Detail
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const detail = loadContactDetail(id);
  if (!detail) { res.status(404).json({ error: 'Kontakt nicht gefunden' }); return; }
  res.json(detail);
});

// ---------------------------------------------------------------------------
// POST /api/contacts — Kontakt erstellen
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const body = req.body as {
    contact_kind?: string;
    type?: string;
    area?: string;
    customer_number?: string;
    salutation?: string | null;
    title?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    suffix?: string | null;
    organization_name?: string | null;
    position?: string | null;
    debtor_number?: string | null;
    creditor_number?: string | null;
    e_invoice_default?: number;
    iban?: string | null;
    bic?: string | null;
    vat_id?: string | null;
    tax_number?: string | null;
    discount_days?: number | null;
    discount_percent?: number | null;
    payment_term_days?: number | null;
    customer_discount?: number | null;
    birthday?: string | null;
    description?: string | null;
    tags?: string | null;
    addresses?: Array<Record<string, unknown>>;
    emails?: Array<Record<string, unknown>>;
    phones?: Array<Record<string, unknown>>;
    websites?: Array<Record<string, unknown>>;
  };

  const contact_kind = body.contact_kind ?? 'person';
  if (!['person', 'organization'].includes(contact_kind)) {
    res.status(400).json({ error: 'contact_kind muss person oder organization sein' });
    return;
  }

  const createFn = db.transaction(() => {
    const customerNumber = body.customer_number ?? getNextCustomerNumber();

    const result = db.prepare(`
      INSERT INTO contacts (
        contact_kind, type, area, customer_number, salutation, title,
        first_name, last_name, suffix, organization_name, position,
        debtor_number, creditor_number, e_invoice_default,
        iban, bic, vat_id, tax_number,
        discount_days, discount_percent, payment_term_days, customer_discount,
        birthday, description, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contact_kind, body.type ?? 'Sonstiges', body.area ?? 'Sonstiges',
      customerNumber, body.salutation ?? null, body.title ?? null,
      body.first_name ?? null, body.last_name ?? null, body.suffix ?? null,
      body.organization_name ?? null, body.position ?? null,
      body.debtor_number ?? null, body.creditor_number ?? null, body.e_invoice_default ?? 0,
      body.iban ?? null, body.bic ?? null, body.vat_id ?? null, body.tax_number ?? null,
      body.discount_days ?? null, body.discount_percent ?? null,
      body.payment_term_days ?? null, body.customer_discount ?? null,
      body.birthday ?? null, body.description ?? null, body.tags ?? null
    );

    const contactId = result.lastInsertRowid as number;

    // Subtabellen
    for (const a of (body.addresses ?? [])) {
      db.prepare(`INSERT INTO contact_addresses (contact_id, street, postal_code, city, country, label, is_primary, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(contactId, a['street'] ?? null, a['postal_code'] ?? null, a['city'] ?? null, a['country'] ?? 'Deutschland', a['label'] ?? 'Rechnungsanschrift', a['is_primary'] ?? 0, a['latitude'] ?? null, a['longitude'] ?? null);
    }
    for (const e of (body.emails ?? [])) {
      db.prepare(`INSERT INTO contact_emails (contact_id, email, label, is_primary) VALUES (?, ?, ?, ?)`)
        .run(contactId, e['email'], e['label'] ?? 'Arbeit', e['is_primary'] ?? 0);
    }
    for (const p of (body.phones ?? [])) {
      db.prepare(`INSERT INTO contact_phones (contact_id, phone, label, is_primary) VALUES (?, ?, ?, ?)`)
        .run(contactId, p['phone'], p['label'] ?? 'Arbeit', p['is_primary'] ?? 0);
    }
    for (const w of (body.websites ?? [])) {
      db.prepare(`INSERT INTO contact_websites (contact_id, url, label, is_primary) VALUES (?, ?, ?, ?)`)
        .run(contactId, w['url'], w['label'] ?? 'Webseite', w['is_primary'] ?? 0);
    }

    db.prepare(`INSERT INTO contact_activity_log (contact_id, event_type, message) VALUES (?, 'created', 'Kontakt erstellt')`).run(contactId);

    return contactId;
  });

  const contactId = createFn();
  const detail = loadContactDetail(contactId as number);
  res.status(201).json(detail);
});

// ---------------------------------------------------------------------------
// PUT /api/contacts/:id — Kontakt aktualisieren
// ---------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM contacts WHERE id = ?`).get(id);
  if (!existing) { res.status(404).json({ error: 'Kontakt nicht gefunden' }); return; }

  const body = req.body as Record<string, unknown>;

  const updateFn = db.transaction(() => {
    db.prepare(`
      UPDATE contacts SET
        contact_kind = COALESCE(?, contact_kind),
        type = COALESCE(?, type),
        area = COALESCE(?, area),
        salutation = ?, title = ?,
        first_name = ?, last_name = ?, suffix = ?,
        organization_name = ?, position = ?,
        debtor_number = ?, creditor_number = ?,
        e_invoice_default = COALESCE(?, e_invoice_default),
        iban = ?, bic = ?, vat_id = ?, tax_number = ?,
        discount_days = ?, discount_percent = ?,
        payment_term_days = ?, customer_discount = ?,
        birthday = ?, description = ?, tags = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      body['contact_kind'] ?? null, body['type'] ?? null, body['area'] ?? null,
      body['salutation'] ?? null, body['title'] ?? null,
      body['first_name'] ?? null, body['last_name'] ?? null, body['suffix'] ?? null,
      body['organization_name'] ?? null, body['position'] ?? null,
      body['debtor_number'] ?? null, body['creditor_number'] ?? null,
      body['e_invoice_default'] ?? null,
      body['iban'] ?? null, body['bic'] ?? null, body['vat_id'] ?? null, body['tax_number'] ?? null,
      body['discount_days'] ?? null, body['discount_percent'] ?? null,
      body['payment_term_days'] ?? null, body['customer_discount'] ?? null,
      body['birthday'] ?? null, body['description'] ?? null, body['tags'] ?? null,
      id
    );

    // Subtabellen: DELETE + re-INSERT
    if (body['addresses'] !== undefined) {
      db.prepare(`DELETE FROM contact_addresses WHERE contact_id = ?`).run(id);
      for (const a of (body['addresses'] as Array<Record<string, unknown>>)) {
        db.prepare(`INSERT INTO contact_addresses (contact_id, street, postal_code, city, country, label, is_primary, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(id, a['street'] ?? null, a['postal_code'] ?? null, a['city'] ?? null, a['country'] ?? 'Deutschland', a['label'] ?? 'Rechnungsanschrift', a['is_primary'] ?? 0, a['latitude'] ?? null, a['longitude'] ?? null);
      }
    }
    if (body['emails'] !== undefined) {
      db.prepare(`DELETE FROM contact_emails WHERE contact_id = ?`).run(id);
      for (const e of (body['emails'] as Array<Record<string, unknown>>)) {
        db.prepare(`INSERT INTO contact_emails (contact_id, email, label, is_primary) VALUES (?, ?, ?, ?)`)
          .run(id, e['email'], e['label'] ?? 'Arbeit', e['is_primary'] ?? 0);
      }
    }
    if (body['phones'] !== undefined) {
      db.prepare(`DELETE FROM contact_phones WHERE contact_id = ?`).run(id);
      for (const p of (body['phones'] as Array<Record<string, unknown>>)) {
        db.prepare(`INSERT INTO contact_phones (contact_id, phone, label, is_primary) VALUES (?, ?, ?, ?)`)
          .run(id, p['phone'], p['label'] ?? 'Arbeit', p['is_primary'] ?? 0);
      }
    }
    if (body['websites'] !== undefined) {
      db.prepare(`DELETE FROM contact_websites WHERE contact_id = ?`).run(id);
      for (const w of (body['websites'] as Array<Record<string, unknown>>)) {
        db.prepare(`INSERT INTO contact_websites (contact_id, url, label, is_primary) VALUES (?, ?, ?, ?)`)
          .run(id, w['url'], w['label'] ?? 'Webseite', w['is_primary'] ?? 0);
      }
    }

    db.prepare(`INSERT INTO contact_activity_log (contact_id, event_type, message) VALUES (?, 'updated', 'Kontakt aktualisiert')`).run(id);
  });

  updateFn();
  const detail = loadContactDetail(id);
  res.json(detail);
});

// ---------------------------------------------------------------------------
// DELETE /api/contacts/:id
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM contacts WHERE id = ?`).get(id);
  if (!existing) { res.status(404).json({ error: 'Kontakt nicht gefunden' }); return; }
  db.prepare(`DELETE FROM contacts WHERE id = ?`).run(id);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /api/contacts/:id/archive
// ---------------------------------------------------------------------------
router.post('/:id/archive', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM contacts WHERE id = ?`).get(id);
  if (!existing) { res.status(404).json({ error: 'Kontakt nicht gefunden' }); return; }

  const { archived } = req.body as { archived: boolean };
  const isArchived = archived ? 1 : 0;
  const msg = archived ? 'Kontakt archiviert' : 'Kontakt wiederhergestellt';
  const eventType = archived ? 'archived' : 'restored';

  db.prepare(`UPDATE contacts SET is_archived = ?, updated_at = datetime('now') WHERE id = ?`).run(isArchived, id);
  db.prepare(`INSERT INTO contact_activity_log (contact_id, event_type, message) VALUES (?, ?, ?)`).run(id, eventType, msg);

  res.json({ ok: true, is_archived: isArchived });
});

// ---------------------------------------------------------------------------
// POST /api/contacts/:id/notes
// ---------------------------------------------------------------------------
router.post('/:id/notes', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM contacts WHERE id = ?`).get(id);
  if (!existing) { res.status(404).json({ error: 'Kontakt nicht gefunden' }); return; }

  const { content } = req.body as { content: string };
  if (!content || !content.trim()) {
    res.status(400).json({ error: 'Inhalt ist erforderlich' });
    return;
  }

  const result = db.prepare(`INSERT INTO contact_notes (contact_id, content) VALUES (?, ?)`).run(id, content.trim());
  db.prepare(`INSERT INTO contact_activity_log (contact_id, event_type, message) VALUES (?, 'note_added', 'Notiz hinzugefuegt')`).run(id);

  const note = db.prepare(`SELECT * FROM contact_notes WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(note);
});

// ---------------------------------------------------------------------------
// PUT /api/contacts/:id/notes/:noteId
// ---------------------------------------------------------------------------
router.put('/:id/notes/:noteId', (req, res) => {
  const id = Number(req.params.id);
  const noteId = Number(req.params.noteId);
  const { content } = req.body as { content: string };

  if (!content || !content.trim()) {
    res.status(400).json({ error: 'Inhalt ist erforderlich' });
    return;
  }

  const note = db.prepare(`SELECT * FROM contact_notes WHERE id = ? AND contact_id = ?`).get(noteId, id);
  if (!note) { res.status(404).json({ error: 'Notiz nicht gefunden' }); return; }

  db.prepare(`UPDATE contact_notes SET content = ?, updated_at = datetime('now') WHERE id = ?`).run(content.trim(), noteId);
  const updated = db.prepare(`SELECT * FROM contact_notes WHERE id = ?`).get(noteId);
  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/contacts/:id/notes/:noteId
// ---------------------------------------------------------------------------
router.delete('/:id/notes/:noteId', (req, res) => {
  const id = Number(req.params.id);
  const noteId = Number(req.params.noteId);

  const note = db.prepare(`SELECT * FROM contact_notes WHERE id = ? AND contact_id = ?`).get(noteId, id);
  if (!note) { res.status(404).json({ error: 'Notiz nicht gefunden' }); return; }

  db.prepare(`DELETE FROM contact_notes WHERE id = ?`).run(noteId);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /api/contacts/:id/addresses
// ---------------------------------------------------------------------------
router.post('/:id/addresses', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT id FROM contacts WHERE id = ?`).get(id);
  if (!existing) { res.status(404).json({ error: 'Kontakt nicht gefunden' }); return; }

  const body = req.body as Record<string, unknown>;
  const result = db.prepare(`INSERT INTO contact_addresses (contact_id, street, postal_code, city, country, label, is_primary, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, body['street'] ?? null, body['postal_code'] ?? null, body['city'] ?? null, body['country'] ?? 'Deutschland', body['label'] ?? 'Rechnungsanschrift', body['is_primary'] ?? 0, body['latitude'] ?? null, body['longitude'] ?? null);

  const addr = db.prepare(`SELECT * FROM contact_addresses WHERE id = ?`).get(result.lastInsertRowid);
  res.status(201).json(addr);
});

// ---------------------------------------------------------------------------
// PUT /api/contacts/:id/addresses/:addrId
// ---------------------------------------------------------------------------
router.put('/:id/addresses/:addrId', (req, res) => {
  const id = Number(req.params.id);
  const addrId = Number(req.params.addrId);
  const body = req.body as Record<string, unknown>;

  const addr = db.prepare(`SELECT * FROM contact_addresses WHERE id = ? AND contact_id = ?`).get(addrId, id);
  if (!addr) { res.status(404).json({ error: 'Adresse nicht gefunden' }); return; }

  db.prepare(`UPDATE contact_addresses SET street = ?, postal_code = ?, city = ?, country = ?, label = ?, is_primary = ?, latitude = ?, longitude = ? WHERE id = ?`)
    .run(body['street'] ?? null, body['postal_code'] ?? null, body['city'] ?? null, body['country'] ?? 'Deutschland', body['label'] ?? 'Rechnungsanschrift', body['is_primary'] ?? 0, body['latitude'] ?? null, body['longitude'] ?? null, addrId);

  const updated = db.prepare(`SELECT * FROM contact_addresses WHERE id = ?`).get(addrId);
  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /api/contacts/:id/addresses/:addrId
// ---------------------------------------------------------------------------
router.delete('/:id/addresses/:addrId', (req, res) => {
  const id = Number(req.params.id);
  const addrId = Number(req.params.addrId);

  const addr = db.prepare(`SELECT * FROM contact_addresses WHERE id = ? AND contact_id = ?`).get(addrId, id);
  if (!addr) { res.status(404).json({ error: 'Adresse nicht gefunden' }); return; }

  db.prepare(`DELETE FROM contact_addresses WHERE id = ?`).run(addrId);
  res.status(204).send();
});

export default router;

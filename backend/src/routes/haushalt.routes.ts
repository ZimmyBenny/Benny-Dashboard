import { Router } from 'express';
import db from '../db/connection';

const router = Router();

// ---------------------------------------------------------------------------
// Hilfsfunktion: Saldo berechnen (alle offenen Eintraege)
// ---------------------------------------------------------------------------

interface HaushaltEintragRow {
  id: number;
  datum: string;
  betrag: number;
  beschreibung: string;
  kategorie: string;
  bezahlt_von: string;
  eintrag_typ: string;
  aufteilung_prozent: number;
  zahlungsart: string | null;
  zeitraum_von: string | null;
  zeitraum_bis: string | null;
  abrechnung_id: number | null;
  created_at: string;
  updated_at: string;
}

function berechneSaldo(eintraege: HaushaltEintragRow[]): {
  saldo: number;
  julia_schuldet: number;
  benny_schuldet: number;
  offene_eintraege: number;
} {
  let julia_schuldet = 0;
  let benny_schuldet = 0;
  let julia_hat_gegeben = 0;
  let benny_hat_gegeben = 0;

  for (const e of eintraege) {
    if (e.eintrag_typ === 'ausgabe') {
      if (e.bezahlt_von === 'benny') {
        // Benny hat bezahlt — Julias Anteil = betrag * (100 - aufteilung_prozent) / 100
        julia_schuldet += e.betrag * (100 - e.aufteilung_prozent) / 100;
      } else {
        // Julia hat bezahlt — Bennys Anteil = betrag * aufteilung_prozent / 100
        benny_schuldet += e.betrag * e.aufteilung_prozent / 100;
      }
    } else if (e.eintrag_typ === 'geldübergabe') {
      if (e.bezahlt_von === 'benny') {
        // Benny hat Geld gegeben → Julia schuldet weniger
        benny_hat_gegeben += e.betrag;
      } else {
        // Julia hat Geld gegeben → Benny schuldet weniger
        julia_hat_gegeben += e.betrag;
      }
    }
  }

  // Positiv = Julia zahlt Benny, negativ = Benny zahlt Julia
  const saldo = (julia_schuldet - benny_schuldet) - (julia_hat_gegeben - benny_hat_gegeben);

  return {
    saldo,
    julia_schuldet,
    benny_schuldet,
    offene_eintraege: eintraege.length,
  };
}

// ---------------------------------------------------------------------------
// GET /saldo — Saldo berechnen
// ---------------------------------------------------------------------------

router.get('/saldo', (_req, res) => {
  const eintraege = db.prepare(
    `SELECT * FROM haushalt_eintraege WHERE abrechnung_id IS NULL ORDER BY datum DESC, created_at DESC`
  ).all() as HaushaltEintragRow[];

  return res.json(berechneSaldo(eintraege));
});

// ---------------------------------------------------------------------------
// GET /abrechnungen — Abrechnungen-Liste
// ---------------------------------------------------------------------------

router.get('/abrechnungen', (_req, res) => {
  const abrechnungen = db.prepare(
    `SELECT a.*, COUNT(e.id) AS eintraege_count
     FROM haushalt_abrechnungen a
     LEFT JOIN haushalt_eintraege e ON e.abrechnung_id = a.id
     GROUP BY a.id
     ORDER BY a.datum DESC`
  ).all();

  return res.json(abrechnungen);
});

// ---------------------------------------------------------------------------
// GET /abrechnungen/:id/eintraege — Eintraege einer Abrechnung
// ---------------------------------------------------------------------------

router.get('/abrechnungen/:id/eintraege', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Ungültige ID' });

  const existing = db.prepare('SELECT id FROM haushalt_abrechnungen WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Abrechnung nicht gefunden' });

  const eintraege = db.prepare(
    `SELECT * FROM haushalt_eintraege WHERE abrechnung_id = ? ORDER BY datum DESC, created_at DESC`
  ).all(id);

  return res.json(eintraege);
});

// ---------------------------------------------------------------------------
// POST /abrechnungen — Abrechnung erstellen
// ---------------------------------------------------------------------------

router.post('/abrechnungen', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const titel = (body.titel as string | undefined)?.trim();
  if (!titel) return res.status(400).json({ error: 'Titel ist erforderlich' });

  // Offene Eintraege laden
  const offeneEintraege = db.prepare(
    `SELECT * FROM haushalt_eintraege WHERE abrechnung_id IS NULL`
  ).all() as HaushaltEintragRow[];

  if (offeneEintraege.length === 0) {
    return res.status(400).json({ error: 'Keine offenen Einträge vorhanden' });
  }

  const { saldo } = berechneSaldo(offeneEintraege);

  // Abrechnung erstellen + Eintraege zuweisen in einer Transaktion
  const result = db.transaction(() => {
    const insertResult = db.prepare(
      `INSERT INTO haushalt_abrechnungen (titel, datum, ausgleich_betrag, notiz)
       VALUES (?, date('now'), ?, ?)`
    ).run(
      titel,
      saldo,
      (body.notiz as string | null) ?? null
    );

    const neueId = insertResult.lastInsertRowid as number;

    db.prepare(
      `UPDATE haushalt_eintraege SET abrechnung_id = ? WHERE abrechnung_id IS NULL`
    ).run(neueId);

    return neueId;
  })();

  const neueAbrechnung = db.prepare(
    `SELECT a.*, COUNT(e.id) AS eintraege_count
     FROM haushalt_abrechnungen a
     LEFT JOIN haushalt_eintraege e ON e.abrechnung_id = a.id
     WHERE a.id = ?
     GROUP BY a.id`
  ).get(result);

  return res.status(201).json(neueAbrechnung);
});

// ---------------------------------------------------------------------------
// GET / — Eintraege laden
// ---------------------------------------------------------------------------

router.get('/', (req, res) => {
  const { abrechnung_id } = req.query as Record<string, string | undefined>;

  let sql: string;
  let params: (string | number)[];

  if (abrechnung_id && abrechnung_id !== 'null') {
    const id = parseInt(abrechnung_id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Ungültige abrechnung_id' });
    sql = `SELECT * FROM haushalt_eintraege WHERE abrechnung_id = ? ORDER BY datum DESC, created_at DESC`;
    params = [id];
  } else {
    sql = `SELECT * FROM haushalt_eintraege WHERE abrechnung_id IS NULL ORDER BY datum DESC, created_at DESC`;
    params = [];
  }

  const eintraege = db.prepare(sql).all(...params);
  return res.json(eintraege);
});

// ---------------------------------------------------------------------------
// POST / — Eintrag erstellen
// ---------------------------------------------------------------------------

router.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>;

  // Pflichtfelder validieren (T-d5g-01)
  const datum = (body.datum as string | undefined)?.trim();
  const betrag = Number(body.betrag);
  const beschreibung = (body.beschreibung as string | undefined)?.trim();
  const kategorie = (body.kategorie as string | undefined)?.trim();
  const bezahlt_von = (body.bezahlt_von as string | undefined)?.trim();

  if (!datum) return res.status(400).json({ error: 'Datum ist erforderlich' });
  if (isNaN(betrag) || betrag <= 0) return res.status(400).json({ error: 'Betrag muss eine positive Zahl sein' });
  if (!beschreibung) return res.status(400).json({ error: 'Beschreibung ist erforderlich' });
  if (!kategorie) return res.status(400).json({ error: 'Kategorie ist erforderlich' });
  if (!bezahlt_von) return res.status(400).json({ error: 'Bezahlt-von ist erforderlich' });

  // Enum-Validierung (T-d5g-01)
  const gueltigeKategorien = ['Einkäufe', 'Kind', 'Haushalt', 'Freizeit', 'Urlaub', 'Nebenkosten', 'Miete', 'Sonstiges'];
  if (!gueltigeKategorien.includes(kategorie)) {
    return res.status(400).json({ error: `Ungültige Kategorie: ${kategorie}` });
  }
  if (!['benny', 'julia'].includes(bezahlt_von)) {
    return res.status(400).json({ error: 'bezahlt_von muss "benny" oder "julia" sein' });
  }

  const eintrag_typ = (body.eintrag_typ as string) || 'ausgabe';
  if (!['ausgabe', 'geldübergabe'].includes(eintrag_typ)) {
    return res.status(400).json({ error: 'eintrag_typ muss "ausgabe" oder "geldübergabe" sein' });
  }

  const aufteilung_prozent = body.aufteilung_prozent !== undefined ? Number(body.aufteilung_prozent) : 50;
  if (isNaN(aufteilung_prozent) || aufteilung_prozent < 0 || aufteilung_prozent > 100) {
    return res.status(400).json({ error: 'aufteilung_prozent muss zwischen 0 und 100 liegen' });
  }

  const zahlungsart = (body.zahlungsart as string | null) ?? null;
  const zeitraum_von = (body.zeitraum_von as string | null) ?? null;
  const zeitraum_bis = (body.zeitraum_bis as string | null) ?? null;

  const result = db.prepare(
    `INSERT INTO haushalt_eintraege
       (datum, betrag, beschreibung, kategorie, bezahlt_von, eintrag_typ, aufteilung_prozent, zahlungsart, zeitraum_von, zeitraum_bis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(datum, betrag, beschreibung, kategorie, bezahlt_von, eintrag_typ, aufteilung_prozent, zahlungsart, zeitraum_von, zeitraum_bis);

  const neuerEintrag = db.prepare('SELECT * FROM haushalt_eintraege WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json(neuerEintrag);
});

// ---------------------------------------------------------------------------
// PUT /:id — Eintrag bearbeiten (T-d5g-02)
// ---------------------------------------------------------------------------

router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Ungültige ID' });

  const existing = db.prepare('SELECT * FROM haushalt_eintraege WHERE id = ?').get(id) as HaushaltEintragRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

  const body = req.body as Record<string, unknown>;

  // Enum-Validierung (T-d5g-02)
  if (body.kategorie !== undefined) {
    const gueltigeKategorien = ['Einkäufe', 'Kind', 'Haushalt', 'Freizeit', 'Urlaub', 'Nebenkosten', 'Miete', 'Sonstiges'];
    if (!gueltigeKategorien.includes(body.kategorie as string)) {
      return res.status(400).json({ error: `Ungültige Kategorie: ${body.kategorie}` });
    }
  }
  if (body.bezahlt_von !== undefined && !['benny', 'julia'].includes(body.bezahlt_von as string)) {
    return res.status(400).json({ error: 'bezahlt_von muss "benny" oder "julia" sein' });
  }

  db.prepare(
    `UPDATE haushalt_eintraege SET
       datum = ?,
       betrag = ?,
       beschreibung = ?,
       kategorie = ?,
       bezahlt_von = ?,
       eintrag_typ = ?,
       aufteilung_prozent = ?,
       zahlungsart = ?,
       zeitraum_von = ?,
       zeitraum_bis = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    body.datum !== undefined ? (body.datum as string) : existing.datum,
    body.betrag !== undefined ? Number(body.betrag) : existing.betrag,
    body.beschreibung !== undefined ? (body.beschreibung as string) : existing.beschreibung,
    body.kategorie !== undefined ? (body.kategorie as string) : existing.kategorie,
    body.bezahlt_von !== undefined ? (body.bezahlt_von as string) : existing.bezahlt_von,
    body.eintrag_typ !== undefined ? (body.eintrag_typ as string) : existing.eintrag_typ,
    body.aufteilung_prozent !== undefined ? Number(body.aufteilung_prozent) : existing.aufteilung_prozent,
    body.zahlungsart !== undefined ? ((body.zahlungsart as string | null) ?? null) : existing.zahlungsart,
    body.zeitraum_von !== undefined ? ((body.zeitraum_von as string | null) ?? null) : existing.zeitraum_von,
    body.zeitraum_bis !== undefined ? ((body.zeitraum_bis as string | null) ?? null) : existing.zeitraum_bis,
    id
  );

  const aktualisiertEintrag = db.prepare('SELECT * FROM haushalt_eintraege WHERE id = ?').get(id);
  return res.json(aktualisiertEintrag);
});

// ---------------------------------------------------------------------------
// DELETE /:id — Eintrag loeschen (T-d5g-03: nur offene Eintraege)
// ---------------------------------------------------------------------------

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Ungültige ID' });

  const existing = db.prepare('SELECT * FROM haushalt_eintraege WHERE id = ?').get(id) as HaushaltEintragRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Eintrag nicht gefunden' });

  // T-d5g-03: Abgerechnete Eintraege koennen nicht geloescht werden
  if (existing.abrechnung_id !== null) {
    return res.status(400).json({ error: 'Abgerechneter Eintrag kann nicht gelöscht werden' });
  }

  db.prepare('DELETE FROM haushalt_eintraege WHERE id = ?').run(id);
  return res.status(204).send();
});

export default router;

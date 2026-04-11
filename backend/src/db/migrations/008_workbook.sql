-- Migration 008: Arbeitsmappe (Wiki/Notizbuch-Modul)

-- Haupt-Arbeitsmappe (singleton fuer jetzt)
CREATE TABLE IF NOT EXISTS workbooks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL DEFAULT 'Meine Arbeitsmappe',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Sektionen (linke Spalte)
CREATE TABLE IF NOT EXISTS workbook_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  workbook_id INTEGER NOT NULL REFERENCES workbooks(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  icon        TEXT    NOT NULL DEFAULT 'folder',
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seiten (mittlere + rechte Spalte)
CREATE TABLE IF NOT EXISTS workbook_pages (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id   INTEGER REFERENCES workbook_sections(id) ON DELETE SET NULL,
  workbook_id  INTEGER NOT NULL REFERENCES workbooks(id) ON DELETE CASCADE,
  title        TEXT    NOT NULL DEFAULT 'Unbenannte Seite',
  content      TEXT    NOT NULL DEFAULT '{"type":"doc","content":[]}',
  content_text TEXT    NOT NULL DEFAULT '',
  excerpt      TEXT,
  tags         TEXT,
  is_pinned    INTEGER NOT NULL DEFAULT 0,
  is_archived  INTEGER NOT NULL DEFAULT 0,
  is_template  INTEGER NOT NULL DEFAULT 0,
  template_id  INTEGER REFERENCES workbook_templates(id) ON DELETE SET NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_by   TEXT    NOT NULL DEFAULT 'benny',
  updated_by   TEXT    NOT NULL DEFAULT 'benny',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Vorlagen
CREATE TABLE IF NOT EXISTS workbook_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  description TEXT,
  content     TEXT    NOT NULL DEFAULT '{"type":"doc","content":[]}',
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seitenaufrufe (fuer "Zuletzt besucht")
CREATE TABLE IF NOT EXISTS workbook_page_views (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id   INTEGER NOT NULL REFERENCES workbook_pages(id) ON DELETE CASCADE,
  viewed_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seitenverknuepfungen (fuer V1.1)
CREATE TABLE IF NOT EXISTS workbook_page_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  from_page_id INTEGER NOT NULL REFERENCES workbook_pages(id) ON DELETE CASCADE,
  to_page_id   INTEGER NOT NULL REFERENCES workbook_pages(id) ON DELETE CASCADE,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- FTS5 Virtual Table fuer Volltextsuche
CREATE VIRTUAL TABLE IF NOT EXISTS workbook_pages_fts USING fts5(
  title,
  content_text,
  tags,
  excerpt,
  content='workbook_pages',
  content_rowid='id'
);

-- FTS5-Trigger: INSERT
CREATE TRIGGER IF NOT EXISTS workbook_pages_fts_insert
AFTER INSERT ON workbook_pages BEGIN
  INSERT INTO workbook_pages_fts(rowid, title, content_text, tags, excerpt)
  VALUES (new.id, new.title, new.content_text, new.tags, new.excerpt);
END;

-- FTS5-Trigger: UPDATE
CREATE TRIGGER IF NOT EXISTS workbook_pages_fts_update
AFTER UPDATE ON workbook_pages BEGIN
  INSERT INTO workbook_pages_fts(workbook_pages_fts, rowid, title, content_text, tags, excerpt)
  VALUES ('delete', old.id, old.title, old.content_text, old.tags, old.excerpt);
  INSERT INTO workbook_pages_fts(rowid, title, content_text, tags, excerpt)
  VALUES (new.id, new.title, new.content_text, new.tags, new.excerpt);
END;

-- FTS5-Trigger: DELETE
CREATE TRIGGER IF NOT EXISTS workbook_pages_fts_delete
AFTER DELETE ON workbook_pages BEGIN
  INSERT INTO workbook_pages_fts(workbook_pages_fts, rowid, title, content_text, tags, excerpt)
  VALUES ('delete', old.id, old.title, old.content_text, old.tags, old.excerpt);
END;

-- Seed: Haupt-Arbeitsmappe
INSERT OR IGNORE INTO workbooks (id, name) VALUES (1, 'Meine Arbeitsmappe');

-- Seed: 5 Default-Vorlagen
INSERT OR IGNORE INTO workbook_templates (id, name, description, content, is_default) VALUES
(1, 'SOP', 'Standard-Betriebsverfahren', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Standard-Betriebsverfahren"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Zweck"}]},{"type":"paragraph","content":[{"type":"text","text":"Beschreibe hier den Zweck dieses SOPs."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Voraussetzungen"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Voraussetzung 1"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Schritt-fuer-Schritt"}]},{"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Schritt 1: Beschreibung"}]}]}]}]}', 1),
(2, 'Checkliste', 'Aufgaben-Checkliste', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Checkliste"}]},{"type":"paragraph","content":[{"type":"text","text":"Beschreibe hier den Kontext dieser Checkliste."}]},{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"Aufgabe 1"}]}]},{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"Aufgabe 2"}]}]},{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"Aufgabe 3"}]}]}]}]}', 1),
(3, 'Besprechungsnotiz', 'Protokoll fuer Meetings', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Besprechungsnotiz"}]},{"type":"paragraph","content":[{"type":"text","text":"Datum: "},{"type":"text","text":""},{"type":"text","text":" | Teilnehmer: "}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Agenda"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Punkt 1"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Ergebnisse"}]},{"type":"paragraph","content":[{"type":"text","text":"Hier die wichtigsten Beschluesse eintragen."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Naechste Schritte"}]},{"type":"taskList","content":[{"type":"taskItem","attrs":{"checked":false},"content":[{"type":"paragraph","content":[{"type":"text","text":"Action Item 1 (Verantwortlich: )"}]}]}]}]}', 1),
(4, 'Briefing', 'Projekt- oder Aufgaben-Briefing', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Briefing"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Hintergrund"}]},{"type":"paragraph","content":[{"type":"text","text":"Was ist der Kontext? Warum machen wir das?"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Ziel"}]},{"type":"paragraph","content":[{"type":"text","text":"Was soll am Ende erreicht sein?"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Zielgruppe / Stakeholder"}]},{"type":"paragraph","content":[{"type":"text","text":"Wer ist betroffen oder involviert?"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Deliverables"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Deliverable 1"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Timeline"}]},{"type":"paragraph","content":[{"type":"text","text":"Deadline: "}]}]}', 1),
(5, 'Prozessbeschreibung', 'Ablauf und Verantwortlichkeiten', '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Prozessbeschreibung"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Prozessname"}]},{"type":"paragraph","content":[{"type":"text","text":"Kurze Beschreibung des Prozesses."}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Beteiligte"}]},{"type":"paragraph","content":[{"type":"text","text":"Wer ist am Prozess beteiligt?"}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Prozessschritte"}]},{"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Schritt 1: Ausloeser / Input"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Schritt 2: Hauptaktivitaet"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Schritt 3: Output / Ergebnis"}]}]}]},{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"Qualitaetssicherung"}]},{"type":"paragraph","content":[{"type":"text","text":"Wie wird die Qualitaet sichergestellt?"}]}]}', 1);

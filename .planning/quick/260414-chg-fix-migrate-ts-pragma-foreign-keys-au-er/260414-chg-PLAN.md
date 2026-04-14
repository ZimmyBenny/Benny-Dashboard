---
phase: quick
plan: 260414-chg
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/src/db/migrate.ts
  - backend/src/db/migrations/012_tasks_archived_status.sql
  - backend/src/db/migrations/021_contracts_add_aktion_banken.sql
autonomous: true
requirements: []
must_haves:
  truths:
    - "PRAGMA foreign_keys = OFF wird VOR dem Migrations-Loop gesetzt (ausserhalb jeder Transaktion)"
    - "PRAGMA foreign_keys = ON wird NACH dem Migrations-Loop gesetzt"
    - "Migrations 012 und 021 enthalten keine eigenen PRAGMA foreign_keys Zeilen mehr"
    - "DROP TABLE in Migrationen loest kein ON DELETE CASCADE aus"
  artifacts:
    - path: "backend/src/db/migrate.ts"
      provides: "PRAGMA foreign_keys = OFF/ON um den gesamten Loop"
    - path: "backend/src/db/migrations/012_tasks_archived_status.sql"
      provides: "Bereinigte Migration ohne redundante PRAGMA-Zeilen"
    - path: "backend/src/db/migrations/021_contracts_add_aktion_banken.sql"
      provides: "Bereinigte Migration ohne redundante PRAGMA-Zeilen"
  key_links:
    - from: "backend/src/db/migrate.ts"
      to: "SQLite connection"
      via: "db.pragma() calls outside transaction scope"
      pattern: "db\\.pragma\\('foreign_keys"
---

<objective>
Fix: PRAGMA foreign_keys = OFF/ON in migrate.ts ausserhalb der Transaktion setzen.

Purpose: SQLite ignoriert PRAGMA foreign_keys innerhalb einer laufenden Transaktion. Migrationen die DROP TABLE verwenden (012, 021) loesen dadurch unbeabsichtigt ON DELETE CASCADE aus und loeschen referenzierte Daten (z.B. Vertrags-Anhaenge). Der Fix setzt PRAGMA auf Connection-Ebene vor/nach dem gesamten Migrations-Loop.

Output: Korrigierte migrate.ts + bereinigte SQL-Dateien
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@backend/src/db/migrate.ts
@backend/src/db/migrations/012_tasks_archived_status.sql
@backend/src/db/migrations/021_contracts_add_aktion_banken.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: PRAGMA foreign_keys in migrate.ts auf Connection-Ebene setzen</name>
  <files>backend/src/db/migrate.ts</files>
  <action>
In runMigrations():
1. VOR dem Migrations-Loop (vor der `for`-Schleife), PRAGMA foreign_keys = OFF setzen:
   `db.pragma('foreign_keys = OFF');`
   Mit Kommentar: `// PRAGMA foreign_keys muss AUSSERHALB einer Transaktion gesetzt werden — innerhalb wird es von SQLite ignoriert`
2. NACH dem Migrations-Loop (nach der `for`-Schleife, vor den `if/else` Log-Zeilen), PRAGMA foreign_keys = ON zuruecksetzen:
   `db.pragma('foreign_keys = ON');`
   Mit Kommentar: `// Foreign Keys wieder aktivieren nach allen Migrationen`

Die bestehende db.transaction()-Logik pro Migration bleibt unveraendert — nur die PRAGMA-Aufrufe werden drumherum gesetzt.
  </action>
  <verify>
    <automated>cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard" && npx tsc --noEmit --project backend/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>migrate.ts setzt db.pragma('foreign_keys = OFF') vor dem Loop und db.pragma('foreign_keys = ON') danach, beide ausserhalb jeder Transaktion</done>
</task>

<task type="auto">
  <name>Task 2: Redundante PRAGMA-Zeilen aus Migrations-SQL entfernen</name>
  <files>backend/src/db/migrations/012_tasks_archived_status.sql, backend/src/db/migrations/021_contracts_add_aktion_banken.sql</files>
  <action>
In beiden SQL-Dateien:
1. Die Zeile `PRAGMA foreign_keys = OFF;` komplett entfernen (inkl. Leerzeile danach falls vorhanden)
2. Die Zeile `PRAGMA foreign_keys = ON;` komplett entfernen
3. Einen Kommentar am Anfang ergaenzen (nach dem bestehenden Header-Kommentar):
   `-- Hinweis: PRAGMA foreign_keys wird zentral in migrate.ts gesteuert`

Die restliche SQL-Logik (CREATE TABLE, INSERT, DROP, ALTER, CREATE INDEX) bleibt unveraendert.
  </action>
  <verify>
    <automated>cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard" && grep -c "PRAGMA foreign_keys" backend/src/db/migrations/012_tasks_archived_status.sql backend/src/db/migrations/021_contracts_add_aktion_banken.sql</automated>
  </verify>
  <done>Beide SQL-Dateien enthalten keine PRAGMA foreign_keys Zeilen mehr. grep gibt 0 fuer beide Dateien zurueck.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Migration SQL -> SQLite | SQL-Dateien werden direkt via db.exec() ausgefuehrt |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-chg-01 | Tampering | Migration SQL files | accept | Lokale App, nur der User hat Zugriff auf die Dateien |
| T-chg-02 | Denial of Service | foreign_keys = OFF bleibt haengen | mitigate | PRAGMA ON in finally-artigem Pattern nach dem Loop — auch bei Fehler wird die Zeile nach dem try/catch im transaction() erreicht, da der Loop selbst nicht in einem aeusseren try steht. Bei einem Crash wird die Connection geschlossen und der naechste Start setzt PRAGMA korrekt. |
</threat_model>

<verification>
1. TypeScript kompiliert fehlerfrei
2. grep findet kein PRAGMA foreign_keys in den beiden SQL-Dateien
3. grep findet db.pragma('foreign_keys in migrate.ts
</verification>

<success_criteria>
- migrate.ts setzt PRAGMA foreign_keys = OFF vor und = ON nach dem Migrations-Loop
- Keine PRAGMA foreign_keys Zeilen in 012 oder 021 SQL-Dateien
- Backend startet fehlerfrei
</success_criteria>

<output>
After completion, create `.planning/quick/260414-chg-fix-migrate-ts-pragma-foreign-keys-au-er/260414-chg-SUMMARY.md`
</output>

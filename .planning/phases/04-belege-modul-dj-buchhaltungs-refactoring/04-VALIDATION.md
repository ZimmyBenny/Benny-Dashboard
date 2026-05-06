---
phase: 4
slug: belege-modul-dj-buchhaltungs-refactoring
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-05
completed: 2026-05-06
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (Backend)** | vitest 2.x — Wave 0 installs (currently no test setup in backend/) |
| **Framework (Frontend)** | vitest 4.1.4 (already installed) |
| **Config file (Backend)** | `backend/vitest.config.ts` — Wave 0 creates |
| **Config file (Frontend)** | existing `frontend/vitest.config.*` |
| **Quick run command** | `cd backend && npx vitest run --reporter=basic` (after Wave 0) |
| **Full suite command** | `cd backend && npx vitest run && cd ../frontend && npx vitest run` |
| **Type-check command** | `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds full suite (estimated for ~30-50 tests) |

---

## Sampling Rate

- **After every task commit:** `tsc --noEmit` of the changed package (Backend or Frontend)
- **After every plan wave:** Quick run of new tests in that plan's scope + tsc on both
- **After Wave 0 (Plan 00):** Backend test suite must run without errors
- **Before `/gsd-verify-work`:** Full suite must be green + tsc clean on both
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

The planner is responsible for filling this table per plan/task. The shape:

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-00-01 | 00 | 0 | BELEG-AUDIT-01 | T-04-AUDIT-01 | append-only audit_log via SQLite trigger blocks UPDATE/DELETE | unit | `cd backend && npx vitest run audit.test.ts` | ✅ | ✅ green |
| 04-01-01 | 01 | 1 | BELEG-SCHEMA-01 | T-04-SCHEMA-01 | migration 040 creates 9 new tables with INTEGER cents fields | integration | `npx tsx backend/src/db/migrate.ts && npx vitest run schema.test.ts` | ✅ | ✅ green |
| 04-02-01 | 02 | 2 | BELEG-RECEIPT-01 | T-04-RECEIPT-01 | receiptService.create rejects invalid amounts | unit | `cd backend && npx vitest run receipts.test.ts` | ✅ | ✅ green |
| 04-03-01 | 03 | 2 | BELEG-OCR-01 | T-04-FILE-01 | upload computes SHA-256 + rejects > max_upload_size | integration | `cd backend && npx vitest run upload.test.ts` | ✅ | ✅ green |
| 04-05-01 | 05 | 3 | BELEG-AUTO-01 | — | task created when receipt due_date - lead_days reached | unit | `cd backend && npx vitest run taskAutomation.test.ts` | ✅ | ✅ green |
| 04-06-01 | 06 | 3 | BELEG-SYNC-01 | — | dj_invoice insert spiegels into receipts via djSyncService | integration | `cd backend && npx vitest run djSync.test.ts` | ✅ | ✅ green |
| 04-10-01 | 10 | 4 | BELEG-TAX-01 | — | UStVA aggregation excludes steuerrelevant=nein | unit | `cd backend && npx vitest run taxCalc.test.ts` | ✅ | ✅ green |
| 04-12-01 | 12 | 8 | BELEG-SEED-01..04 | T-04-SEED-01..04 | 5 Beispiel-Belege (Alibaba/Thomann/E.ON/Google/Hochzeit Müller) + DJ-Event + Trip seedet idempotent mit createBackup | integration | `cd backend && npx tsx scripts/seed-belege.ts` | ✅ | ✅ green |
| 04-12-02 | 12 | 8 | BELEG-SEED-04 | — | End-to-End Flow create→OCR→update→supplierMemory→tax→freigeben + RC + Privat + Mirror | integration | `cd backend && npx vitest run integration.belege.test.ts` | ✅ | ✅ green |

*The above is a starting outline — Plan-N adds its own task rows.*

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Final Test Run (2026-05-06):** 117/117 Backend-Tests gruen (14 Test-Files), 41/41 Frontend-Tests gruen, beide tsc clean.

---

## Wave 0 Requirements

Wave 0 = Plan 00 (audit-refactor). It MUST install + configure tests before any other plan runs:

- [x] `backend/package.json` adds `vitest` + `@vitest/ui` to devDependencies
- [x] `backend/vitest.config.ts` — config file with `globals: true`, in-memory SQLite test setup
- [x] `backend/test/setup.ts` — initializes :memory: DB, runs migrations against it
- [x] `backend/test/helpers.ts` — fixtures (createTestReceipt, createTestContact, runMigrations)
- [x] `backend/test/audit.test.ts` — smoke test for append-only audit_log triggers
- [x] `backend/test/schema.test.ts` — placeholder for Plan 01 (now 12 tests)
- [x] `npx vitest run` exits 0 with at least one green test (now 117 tests)

Wave 0 complete (Plan 04-00) — `wave_0_complete: true` set in frontmatter (2026-05-06).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| OCR-Vorschlaege im Upload-UI sind nuetzlich (nicht nur "manuell" Badges) | BELEG-OCR-02 | Tesseract-Output ist Daten-abhaengig, kein deterministischer Test moeglich | Plan 12 Seed: 5 echte Beleg-PDFs hochladen, mind. 3 von 5 Feldern (Lieferant, Datum, Betrag) sollen mit Confidence > 0.6 erkannt werden |
| GoBD-Lock greift visuell richtig (read-only Felder nach Freigabe) | BELEG-GOBD-01 | UI-Verhalten | Beleg in Detail-View → "Als geprueft" klicken → Felder Beträge/Datum/Lieferant müssen disabled sein, nur Notizen-Feld editierbar |
| StatusBadge-Glow ist konsistent mit DJ-Reiter | DESIGN-04 | Visueller Vergleich | Side-by-side Screenshot DjInvoicesPage vs. /belege/alle |
| PDF-Vorschau in Detail-View laedt fluessig | BELEG-UX-01 | Browser-Performance, dateiabhaengig | 5 Beispiel-PDFs aus Plan 12 oeffnen — kein Spinner > 2s |
| Drag&Drop akzeptiert Multi-File und ignoriert HEIC | BELEG-UX-02 | Browser-File-API | 3 PDFs + 1 HEIC gleichzeitig droppen → 3 Belege erstellt, HEIC mit Fehlermeldung abgelehnt |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags (always `vitest run`, never `vitest`)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter
- [x] Manual-only verifications are explicitly listed in plan acceptance_criteria

**Approval:** complete

**Final Sign-Off (2026-05-06):**
- 117/117 Backend-Tests gruen (14 Files: audit, schema, cents, files, receipts, taxCalc, duplicateCheck, receiptParser, upload, supplierMemory, taskAutomation, djSync, tripSync, integration.belege)
- 41/41 Frontend-Tests gruen
- Backend `tsc --noEmit` exit 0
- Frontend `tsc --noEmit` exit 0
- 5 Beispiel-Belege im System eingespielt (Alibaba/Thomann/E.ON/Google/Hochzeit Müller) + DJ-Event + Trip mit automatischem Mirror in receipts
- Manual-UAT durch User in Task 04-12 Task 3 (human-verify Checkpoint) — User bestaetigt vor finalem Phase-Abschluss

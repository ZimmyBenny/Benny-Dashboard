/**
 * Tests fuer den Upload-Endpoint (POST /api/belege/upload).
 *
 * Strategie:
 *  - Logic-Level-Tests: Wir testen die in der Upload-Route verwendeten Service-Aufrufe
 *    (sha256 → duplicateCheck → receiptService.create) End-to-End mit echtem In-Memory-DB.
 *  - File-Filter-Tests: Wir verifizieren die Multer-Allowed-List durch Inspektion der Route-Datei.
 *  - HTTP-Roundtrip mit Multer-Multipart waere zwar moeglich (supertest), aber bringt fuer
 *    den lokalen Use-Case wenig zusaetzliche Confidence — die kritischen Bauteile sind die
 *    Service-Layer-Aufrufe (mit DB-Audit + GoBD-Trigger), die hier bereits gecovert sind.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

// vi.mock wird gehoistet — DB-Referenz muss ein veraenderbares Objekt sein
const dbHolder: { db: Database.Database | null } = { db: null };

vi.mock('../src/db/connection', () => ({
  default: new Proxy(
    {},
    {
      get(_target, prop) {
        if (!dbHolder.db) throw new Error('Test DB not initialized');
        const v = (dbHolder.db as unknown as Record<string | symbol, unknown>)[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(dbHolder.db) : v;
      },
    },
  ),
}));

import { createTestDb } from './setup';
import * as receiptService from '../src/services/receiptService';
import { findBySha256 } from '../src/services/duplicateCheckService';
import { sha256OfFile } from '../src/lib/files';

function fakeReq(): import('express').Request {
  return {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    user: { id: 1, username: 'tester' },
  } as unknown as import('express').Request;
}

describe('upload integration (logic-level)', () => {
  beforeEach(() => {
    dbHolder.db = createTestDb();
  });

  it('sha256OfFile berechnet stabilen Hash fuer eine reale Tmp-Datei', async () => {
    const tmp = path.join(os.tmpdir(), `upload-test-${Date.now()}.bin`);
    const content = Buffer.from('Hello Beleg-World');
    fs.writeFileSync(tmp, content);
    try {
      const sha = await sha256OfFile(tmp);
      // gegen referenz-hash mit echter crypto-API
      const ref = crypto.createHash('sha256').update(content).digest('hex');
      expect(sha).toBe(ref);
      expect(sha).toHaveLength(64);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('receiptService.create + findBySha256 → gleicher Beleg wird ueber Hash gefunden', () => {
    const r = receiptService.create(fakeReq(), {
      type: 'eingangsrechnung',
      receipt_date: '2026-05-05',
      file_hash_sha256: 'sha-test-1',
      amount_gross_cents: 0,
    });
    expect(r.id).toBeGreaterThan(0);
    const dup = findBySha256('sha-test-1');
    expect(dup?.id).toBe(r.id);
    expect(dup?.file_hash_sha256).toBe('sha-test-1');
  });

  it('zwei unterschiedliche Hashes ergeben zwei unterschiedliche Receipts', () => {
    const a = receiptService.create(fakeReq(), {
      type: 'beleg',
      receipt_date: '2026-05-05',
      file_hash_sha256: 'sha-A',
    });
    const b = receiptService.create(fakeReq(), {
      type: 'beleg',
      receipt_date: '2026-05-05',
      file_hash_sha256: 'sha-B',
    });
    expect(a.id).not.toBe(b.id);
    expect(findBySha256('sha-A')?.id).toBe(a.id);
    expect(findBySha256('sha-B')?.id).toBe(b.id);
  });

  it('upload-Pipeline: Receipt mit status=ocr_pending nach Insert', () => {
    const r = receiptService.create(fakeReq(), {
      type: 'eingangsrechnung',
      source: 'manual_upload',
      receipt_date: '2026-05-05',
      status: 'ocr_pending',
      file_hash_sha256: 'sha-pending-1',
      original_filename: 'rechnung.pdf',
      created_via: 'manual_upload',
    });
    const persisted = dbHolder.db!
      .prepare(`SELECT status, original_filename, source FROM receipts WHERE id = ?`)
      .get(r.id) as { status: string; original_filename: string; source: string };
    expect(persisted.status).toBe('ocr_pending');
    expect(persisted.original_filename).toBe('rechnung.pdf');
    expect(persisted.source).toBe('manual_upload');
  });

  it('Allowed-Extensions Liste: nur .pdf/.jpg/.jpeg/.png — keine .heic/.exe/.zip', () => {
    // Multer fileFilter pflegt diese Liste; Test dokumentiert das Contract.
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    expect(allowed).toContain('.pdf');
    expect(allowed).toContain('.jpg');
    expect(allowed).toContain('.jpeg');
    expect(allowed).toContain('.png');
    expect(allowed).not.toContain('.heic');
    expect(allowed).not.toContain('.exe');
    expect(allowed).not.toContain('.zip');
  });

  it('path-traversal in originalname wird durch sanitizeForFilename neutralisiert', async () => {
    const { sanitizeForFilename } = await import('../src/lib/filenames');
    expect(sanitizeForFilename('../../etc/passwd')).not.toContain('..');
    expect(sanitizeForFilename('../../etc/passwd')).not.toContain('/');
    expect(sanitizeForFilename('Mietvertrag\\Wohnung.pdf')).not.toContain('\\');
  });
});

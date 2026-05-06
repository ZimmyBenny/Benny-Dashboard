import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';

// vi.mock-Proxy-Pattern (wiederverwendet aus Plan 04-02/03/04) — erlaubt
// swapping der :memory:-DB pro Test, ohne connection.ts zu modifizieren.
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
import { checkOpenPayments } from '../src/services/taskAutomationService';

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function setLeadDays(n: number): void {
  dbHolder.db!
    .prepare(`UPDATE app_settings SET value = ? WHERE key = 'payment_task_lead_days'`)
    .run(String(n));
}

function insertReceipt(opts: {
  due_date: string;
  status: string;
  supplier_name?: string;
  amount_gross_cents?: number;
  supplier_invoice_number?: string | null;
  payment_method?: string | null;
}): number {
  const r = dbHolder.db!
    .prepare(
      `
        INSERT INTO receipts (
          type, source, receipt_date, due_date, status,
          supplier_name, supplier_invoice_number,
          amount_gross_cents, payment_method
        )
        VALUES ('eingangsrechnung', 'manual_upload', '2026-05-01', ?, ?,
                ?, ?, ?, ?)
      `,
    )
    .run(
      opts.due_date,
      opts.status,
      opts.supplier_name ?? 'Thomann',
      opts.supplier_invoice_number ?? null,
      opts.amount_gross_cents ?? 11900,
      opts.payment_method ?? null,
    );
  return Number(r.lastInsertRowid);
}

describe('taskAutomationService.checkOpenPayments', () => {
  beforeEach(() => {
    dbHolder.db = createTestDb();
    setLeadDays(3);
  });

  it('creates task when due_date is within lead_days window', () => {
    insertReceipt({ due_date: todayPlus(2), status: 'offen', supplier_name: 'Thomann', amount_gross_cents: 11900 });
    const r = checkOpenPayments();
    expect(r.tasksCreated).toBe(1);
    expect(r.scanned).toBe(1);
    const tasks = dbHolder.db!
      .prepare(`SELECT title, source_receipt_id, status, priority, due_date FROM tasks`)
      .all() as Array<{
        title: string;
        source_receipt_id: number;
        status: string;
        priority: string;
        due_date: string;
      }>;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toContain('Thomann');
    expect(tasks[0].title).toContain('119,00');
    expect(tasks[0].status).toBe('open');
    expect(tasks[0].priority).toBe('medium');
    expect(tasks[0].source_receipt_id).toBeGreaterThan(0);
  });

  it('skips receipts with due_date too far away', () => {
    insertReceipt({ due_date: todayPlus(30), status: 'offen', supplier_name: 'Future Co', amount_gross_cents: 5000 });
    const r = checkOpenPayments();
    expect(r.tasksCreated).toBe(0);
    expect(r.scanned).toBe(0);
  });

  it('is idempotent — second call does not create duplicate', () => {
    insertReceipt({ due_date: todayPlus(1), status: 'offen', supplier_name: 'Thomann', amount_gross_cents: 11900 });
    const r1 = checkOpenPayments();
    expect(r1.tasksCreated).toBe(1);
    const r2 = checkOpenPayments();
    expect(r2.tasksCreated).toBe(0);
    const cnt = (dbHolder.db!.prepare(`SELECT COUNT(*) as c FROM tasks`).get() as { c: number }).c;
    expect(cnt).toBe(1);
  });

  it('skips paid receipts', () => {
    insertReceipt({ due_date: todayPlus(2), status: 'bezahlt', supplier_name: 'Paid Co', amount_gross_cents: 5000 });
    const r = checkOpenPayments();
    expect(r.tasksCreated).toBe(0);
  });

  it('respects lead_days setting (set to 7 → triggers 7 days early)', () => {
    setLeadDays(7);
    insertReceipt({ due_date: todayPlus(6), status: 'offen', supplier_name: 'EarlyBird Co', amount_gross_cents: 5000 });
    const r = checkOpenPayments();
    expect(r.tasksCreated).toBe(1);
  });

  it('teilbezahlt status also triggers task', () => {
    insertReceipt({ due_date: todayPlus(1), status: 'teilbezahlt', supplier_name: 'Half Paid', amount_gross_cents: 10000 });
    const r = checkOpenPayments();
    expect(r.tasksCreated).toBe(1);
  });

  it('skips receipts without due_date', () => {
    dbHolder.db!
      .prepare(
        `
          INSERT INTO receipts (type, source, receipt_date, status,
                                supplier_name, amount_gross_cents)
          VALUES ('eingangsrechnung','manual_upload','2026-05-01','offen','NoDueDate Co', 5000)
        `,
      )
      .run();
    const r = checkOpenPayments();
    expect(r.tasksCreated).toBe(0);
  });

  it('task title contains supplier and amount with comma decimal separator', () => {
    insertReceipt({
      due_date: todayPlus(2),
      status: 'offen',
      supplier_name: 'Müller GmbH',
      amount_gross_cents: 4250,
    });
    checkOpenPayments();
    const tasks = dbHolder.db!.prepare(`SELECT title FROM tasks`).all() as Array<{ title: string }>;
    expect(tasks[0].title).toContain('Müller GmbH');
    expect(tasks[0].title).toContain('42,50');
    expect(tasks[0].title).toContain('€');
  });

  it('falls back to default lead_days=3 if setting missing/invalid', () => {
    dbHolder.db!.prepare(`DELETE FROM app_settings WHERE key = 'payment_task_lead_days'`).run();
    insertReceipt({ due_date: todayPlus(2), status: 'offen', supplier_name: 'Default Co' });
    const r = checkOpenPayments();
    expect(r.tasksCreated).toBe(1);
  });

  it('uses receipt due_date as task due_date', () => {
    const due = todayPlus(2);
    insertReceipt({ due_date: due, status: 'offen', supplier_name: 'Thomann' });
    checkOpenPayments();
    const t = dbHolder.db!.prepare(`SELECT due_date FROM tasks LIMIT 1`).get() as {
      due_date: string;
    };
    expect(t.due_date).toBe(due);
  });

  it('createdReceiptIds list contains the receipt id', () => {
    const id = insertReceipt({ due_date: todayPlus(1), status: 'offen', supplier_name: 'Thomann' });
    const r = checkOpenPayments();
    expect(r.createdReceiptIds).toEqual([id]);
  });
});

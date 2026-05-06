import { describe, it, expect } from 'vitest';
import { parse } from '../src/services/receiptParserService';

describe('receiptParserService.parse', () => {
  it('extracts DE date "Rechnungsdatum: 05.05.2026" → 2026-05-05', () => {
    const r = parse('Rechnungsdatum: 05.05.2026\nBetrag: 100,00 €');
    expect(r.receipt_date.value).toBe('2026-05-05');
    expect(r.receipt_date.confidence).toBeGreaterThan(0.5);
  });

  it('extracts ISO date "2026-05-05" without prefix', () => {
    const r = parse('Eingangsdatum 2026-05-05\nBetrag: 100,00 €');
    expect(r.receipt_date.value).toBe('2026-05-05');
  });

  it('extracts amount "Gesamtbetrag: 1.234,56 €" → 123456 cents', () => {
    const r = parse('Gesamtbetrag: 1.234,56 €');
    expect(r.amount_gross_cents.value).toBe(123456);
    expect(r.amount_gross_cents.confidence).toBeGreaterThan(0.7);
  });

  it('extracts vat rate "USt 19%" → 19', () => {
    const r = parse('Netto: 100,00 €\nUSt 19% : 19,00 €\nGesamt: 119,00 €');
    expect(r.vat_rate.value).toBe(19);
  });

  it('detects Reverse-Charge marker "§ 13b UStG"', () => {
    const r = parse('Steuerschuldnerschaft des Leistungsempfaengers gem. § 13b UStG');
    expect(r.reverse_charge.value).toBe(true);
    expect(r.reverse_charge.confidence).toBeGreaterThan(0.9);
  });

  it('extracts IBAN "DE89 3704 0044 0532 0130 00"', () => {
    const r = parse('IBAN: DE89 3704 0044 0532 0130 00\nBetrag: 50,00 €');
    expect(r.iban.value).toBe('DE89370400440532013000');
  });

  it('extracts invoice number "Rechnungsnr.: RE-12345"', () => {
    const r = parse('Rechnungsnr.: RE-12345\nDatum: 05.05.2026');
    expect(r.supplier_invoice_number.value).toBe('RE-12345');
  });

  it('computes net + vat from gross + rate (119,00 € @ 19% → 10000 + 1900 cents)', () => {
    const r = parse('Gesamt: 119,00 €\nUSt: 19%');
    expect(r.amount_gross_cents.value).toBe(11900);
    expect(r.amount_net_cents.value).toBe(10000);
    expect(r.vat_amount_cents.value).toBe(1900);
  });

  it('returns null + confidence 0 when no patterns match', () => {
    const r = parse('lorem ipsum dolor sit amet');
    expect(r.receipt_date.value).toBeNull();
    expect(r.amount_gross_cents.value).toBeNull();
    expect(r.vat_rate.value).toBeNull();
    expect(r.iban.value).toBeNull();
  });

  it('extracts plausible supplier from first non-empty line', () => {
    const r = parse('Thomann GmbH\nRechnung 12345\nDatum: 05.05.2026');
    expect(r.supplier_name.value).toBe('Thomann GmbH');
  });

  it('reverse_charge defaults to false with confidence 1.0', () => {
    const r = parse('Hallo Welt');
    expect(r.reverse_charge.value).toBe(false);
    expect(r.reverse_charge.confidence).toBe(1.0);
  });
});

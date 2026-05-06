import { describe, it, expect } from 'vitest';
import {
  toCents,
  toEur,
  calcVatCents,
  calcGrossCents,
  calcNetCents,
  parseAmountToCents,
} from '../src/lib/cents';
import { sanitizeForFilename } from '../src/lib/filenames';

describe('cents math', () => {
  it('toCents(0.07) === 7 (no float drift)', () => {
    expect(toCents(0.07)).toBe(7);
  });

  it('toCents(1234.56) === 123456', () => {
    expect(toCents(1234.56)).toBe(123456);
  });

  it('toEur(123456) === 1234.56', () => {
    expect(toEur(123456)).toBe(1234.56);
  });

  it('calcVatCents(10000, 19) === 1900', () => {
    expect(calcVatCents(10000, 19)).toBe(1900);
  });

  it('calcVatCents(any, 0) === 0', () => {
    expect(calcVatCents(99999, 0)).toBe(0);
  });

  it('calcGrossCents(10000, 19) === 11900', () => {
    expect(calcGrossCents(10000, 19)).toBe(11900);
  });

  it('calcNetCents(11900, 19) === 10000', () => {
    expect(calcNetCents(11900, 19)).toBe(10000);
  });

  it('calcNetCents 7%-edge: 1749 -> 1635', () => {
    expect(calcNetCents(1749, 7)).toBe(1635);
  });

  it('calcNetCents(any, 0) === any', () => {
    expect(calcNetCents(7777, 0)).toBe(7777);
  });

  it('parseAmountToCents DE format "1.234,56" -> 123456', () => {
    expect(parseAmountToCents('1.234,56')).toBe(123456);
  });

  it('parseAmountToCents EN format "1234.56" -> 123456', () => {
    expect(parseAmountToCents('1234.56')).toBe(123456);
  });

  it('parseAmountToCents with currency suffix "€"', () => {
    expect(parseAmountToCents('999,99 €')).toBe(99999);
  });
});

describe('sanitizeForFilename', () => {
  it('lowercases and replaces spaces', () => {
    expect(sanitizeForFilename('Alibaba Supplier GmbH')).toBe('alibaba-supplier-gmbh');
  });

  it('replaces umlauts with ae/oe/ue/ss', () => {
    expect(sanitizeForFilename('Müller & Söhne')).toBe('mueller-soehne');
  });

  it('removes path-separators', () => {
    expect(sanitizeForFilename('Über/Pfad\\Test')).toBe('ueber-pfad-test');
  });

  it('truncates to maxLength', () => {
    expect(sanitizeForFilename('a'.repeat(100), 10)).toBe('aaaaaaaaaa');
  });
});

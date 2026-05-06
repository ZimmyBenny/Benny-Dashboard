import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { sha256OfFile, receiptStoragePath, DEFAULT_BELEGE_ROOT } from '../src/lib/files';

describe('files', () => {
  it('receiptStoragePath returns YYYY/MM-Pfad', () => {
    const p = receiptStoragePath('2026-05-05');
    expect(p.endsWith(path.join('2026', '05'))).toBe(true);
  });

  it('DEFAULT_BELEGE_ROOT is in ~/.local/share/benny-dashboard/belege (NICHT in iCloud)', () => {
    expect(DEFAULT_BELEGE_ROOT).toContain('.local/share/benny-dashboard/belege');
    expect(DEFAULT_BELEGE_ROOT).not.toContain('CloudDocs');
  });

  it('sha256OfFile returns deterministic hex for known content', async () => {
    const tmp = path.join(os.tmpdir(), `belege-test-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'hello world');
    try {
      const sha = await sha256OfFile(tmp);
      expect(sha).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});

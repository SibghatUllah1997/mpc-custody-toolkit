import { describe, it, expect } from 'vitest';
import { Secp256k1, Shamir } from '../src';
import { exportShareFile, importShareFile } from '../src/cli';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bytesToHex } from '../src/utils/bytes';

describe('CLI import/export share files (plain JSON + checksum)', () => {
  it('exports a share to file and imports it back with validation', async () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s] = Shamir.splitSecret(secret, 2, 2);
    const dir = mkdtempSync(join(tmpdir(), 'mpc-io-'));
    try {
      const file = join(dir, `share-x${s.x}.json`);
      await exportShareFile(s, file);
      const back = await importShareFile(file);
      expect(back.x).toBe(s.x);
      expect(bytesToHex(back.y)).toBe(bytesToHex(s.y));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


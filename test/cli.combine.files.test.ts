import { describe, it, expect } from 'vitest';
import { Secp256k1, Shamir } from '../src';
import { exportShareFile, combineFromFiles } from '../src/cli';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bytesToHex } from '../src/utils/bytes';

describe('combine from share files (plain + encrypted)', () => {
  it('combines 2-of-3 shares from mixed files', async () => {
    const secret = Secp256k1.generatePrivateKey();
    const shares = Shamir.splitSecret(secret, 2, 3);
    const dir = mkdtempSync(join(tmpdir(), 'mpc-combine-'));
    try {
      const f1 = join(dir, `s1.json`);
      const f2 = join(dir, `s2.enc.json`);
      // Export one plain and one encrypted
      await exportShareFile(shares[0], f1);
      await exportShareFile(shares[1], f2, { password: 'pw' });
      const recombined = await combineFromFiles([f1, f2], { password: 'pw' });
      expect(bytesToHex(recombined)).toBe(bytesToHex(secret));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


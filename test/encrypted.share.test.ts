import { describe, it, expect } from 'vitest';
import { Secp256k1, Shamir } from '../src';
import { exportShareFile, importShareFile } from '../src/cli';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bytesToHex } from '../src/utils/bytes';

describe('encrypted share files (scrypt + AES-256-GCM)', () => {
  it('roundtrips with password; rejects missing password', async () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s] = Shamir.splitSecret(secret, 2, 2);
    const dir = mkdtempSync(join(tmpdir(), 'mpc-enc-'));
    const file = join(dir, `share-x${s.x}.enc.json`);
    try {
      await exportShareFile(s, file, { password: 'test-password' });
      const txt = readFileSync(file, 'utf8');
      const obj = JSON.parse(txt);
      expect(obj.type).toBe('encrypted');
      await expect(importShareFile(file)).rejects.toThrow();
      const back = await importShareFile(file, { password: 'test-password' });
      expect(back.x).toBe(s.x);
      expect(bytesToHex(back.y)).toBe(bytesToHex(s.y));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});


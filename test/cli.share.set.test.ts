import { describe, it, expect } from 'vitest';
import { Secp256k1, Shamir } from '../src';
import { combineFromFiles, exportShareFile, importShareBackupFile, parseArgs, parseShareSetArgs } from '../src/cli';
import { newShareSetId } from '../src/encoding/share';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { bytesToHex } from '../src/utils/bytes';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-set-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('share files tagged with split metadata', () => {
  it('combines tagged shares from one split, including an encrypted one', async () => {
    await withDir(async (dir) => {
      const secret = Secp256k1.generatePrivateKey();
      const shares = Shamir.splitSecret(secret, 2, 3);
      const set = { id: newShareSetId(), threshold: 2, total: 3 };
      const a = join(dir, 'a.json');
      const b = join(dir, 'b.json');
      await exportShareFile(shares[0], a, { set });
      await exportShareFile(shares[2], b, { set, password: 'pw' });
      expect((await importShareBackupFile(b, { password: 'pw' })).set).toEqual(set);
      expect(bytesToHex(await combineFromFiles([a, b], { password: 'pw' }))).toBe(bytesToHex(secret));
    });
  });

  it('refuses to combine shares cut from two different splits', async () => {
    await withDir(async (dir) => {
      const one = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 2);
      const two = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 2);
      const a = join(dir, 'a.json');
      const b = join(dir, 'b.json');
      await exportShareFile(one[0], a, { set: { id: newShareSetId(), threshold: 2, total: 2 } });
      await exportShareFile(two[1], b, { set: { id: newShareSetId(), threshold: 2, total: 2 } });
      await expect(combineFromFiles([a, b])).rejects.toThrow(/different splits/);
    });
  });

  it('parses --set-id with --threshold and --total', () => {
    const id = newShareSetId();
    expect(parseShareSetArgs(parseArgs(['--set-id', id, '--threshold', '2', '--total', '3']))).toEqual({
      id,
      threshold: 2,
      total: 3,
    });
    expect(parseShareSetArgs(parseArgs([]))).toBeUndefined();
    expect(() => parseShareSetArgs(parseArgs(['--set-id', id]))).toThrow(/requires --threshold and --total/);
  });
});

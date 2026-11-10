import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Secp256k1, Shamir } from '../src';
import {
  combineFromNdjson,
  exportSharesNdjson,
  importSharesNdjson,
  loadSharesFromNdjson,
  parseShareJson,
} from '../src/cli';
import { newShareSetId } from '../src/encoding/share';
import { bytesToHex } from '../src/utils/bytes';
import { explainError } from '../src/ux/errors';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-cli-ndjson-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('CLI NDJSON share streams', () => {
  it('exports, imports, and combines a tagged share set', async () => {
    await withDir(async (dir) => {
      const secret = Secp256k1.generatePrivateKey();
      const shares = Shamir.splitSecret(secret, 2, 3);
      const set = { id: newShareSetId(), threshold: 2, total: 3 };
      const file = join(dir, 'vault.ndjson');
      await exportSharesNdjson(shares, file, { set });
      const backups = await importSharesNdjson(file);
      expect(backups).toHaveLength(3);
      expect(backups[0].set).toEqual(set);
      expect(bytesToHex(await combineFromNdjson(file))).toBe(bytesToHex(secret));
      const loaded = await loadSharesFromNdjson(file);
      expect(loaded.map((s) => s.x)).toEqual(shares.map((s) => s.x));
    });
  });

  it('lets export-shares accept a single share via parseShareJson minCount', () => {
    const y = '11'.repeat(32);
    expect(parseShareJson(JSON.stringify([{ x: 1, y }]), { minCount: 1 })).toHaveLength(1);
    expect(() => parseShareJson('[]', { minCount: 1 })).toThrow(/at least 1 shares/);
  });

  it('hints when combine is missing every input form', () => {
    const explained = explainError(
      new Error('combine requires --shares <json-array>, --files <paths>, or --stream <ndjson>')
    );
    expect(explained.hint).toMatch(/--stream vault.ndjson/);
  });
});

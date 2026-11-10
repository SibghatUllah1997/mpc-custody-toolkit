import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'node:stream';
import { Secp256k1, Shamir, ShareStream } from '../src';
import { newShareSetId } from '../src/encoding/share';
import { bytesToHex } from '../src/utils/bytes';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-ndjson-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('NDJSON share backup files', () => {
  it('writes a file, reads it back, and reconstructs the secret', async () => {
    await withDir(async (dir) => {
      const secret = Secp256k1.generatePrivateKey();
      const shares = Shamir.splitSecret(secret, 2, 3);
      const set = { id: newShareSetId(), threshold: 2, total: 3 };
      const file = join(dir, 'vault.ndjson');
      await ShareStream.exportShareBackupNdjson(file, [
        { share: shares[0], set },
        { share: shares[1], set },
      ]);
      const backups = await ShareStream.importShareBackupNdjson(file);
      expect(backups).toHaveLength(2);
      expect(bytesToHex(await ShareStream.combineFromShareBackupNdjson(file))).toBe(bytesToHex(secret));
    });
  });

  it('rejects duplicate indexes and mixed splits before combine', async () => {
    const a = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 2);
    const b = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 2);
    const setA = { id: newShareSetId(), threshold: 2, total: 2 };
    const setB = { id: newShareSetId(), threshold: 2, total: 2 };
    expect(() =>
      ShareStream.sharesFromBackupStream([
        { share: a[0], sourceVersion: 2, set: setA },
        { share: { x: a[0].x, y: a[1].y }, sourceVersion: 2, set: setA },
      ])
    ).toThrow(/duplicate share x=/);
    expect(() =>
      ShareStream.sharesFromBackupStream([
        { share: a[0], sourceVersion: 2, set: setA },
        { share: b[1], sourceVersion: 2, set: setB },
      ])
    ).toThrow(/different splits/);
  });

  it('rejects a stream with fewer than two records', async () => {
    const [share] = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 2);
    const line = ShareStream.encodeShareRecord(share) + '\n';
    await expect(ShareStream.combineFromShareBackupStream(Readable.from([line]))).rejects.toThrow(
      /need at least 2 share records/
    );
  });
});

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { Recovery, Secp256k1, Shamir } from '../src';
import { exportShareFile } from '../src/cli';
import { newShareSetId } from '../src/encoding/share';
import { exportShareBackupNdjson } from '../src/encoding/stream';
import { InputError } from '../src/errors';
import { dryRunRecovery, dryRunRecoveryFromFiles, dryRunRecoveryFromNdjson } from '../src/recovery';
import { bytesToHex } from '../src/utils/bytes';
import { getPublicKeyCompressed } from '../src/crypto/secp256k1';

const PASSWORD = 'test-password';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-dryrun-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('dryRunRecovery', () => {
  it('reconstructs a public key and omits the secret and share y values', () => {
    const secret = Secp256k1.generatePrivateKey();
    const shares = Shamir.splitSecret(secret, 2, 3);
    const set = { id: newShareSetId(), threshold: 2, total: 3 };
    const backups = shares.slice(0, 2).map((share) => ({
      backup: { share, set, sourceVersion: 2 },
    }));
    const report = dryRunRecovery(backups);
    expect(report.ok).toBe(true);
    expect(report.shareCount).toBe(2);
    expect(report.usedShareXs).toEqual([1, 2]);
    expect(report.threshold).toBe(2);
    expect(report.total).toBe(3);
    expect(report.setId).toBe(set.id);
    expect(report.encryptedCount).toBe(0);
    expect(report.publicKey).toBe(bytesToHex(getPublicKeyCompressed(secret)));
    const dumped = JSON.stringify(report);
    expect(dumped).not.toContain(bytesToHex(secret));
    for (const share of shares) {
      expect(dumped).not.toContain(bytesToHex(share.y));
    }
    expect(Object.keys(report.shares[0]).sort()).toEqual(['encrypted', 'sourceVersion', 'x']);
  });

  it('rejects too few shares, duplicates, and mixed splits', () => {
    const a = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 2);
    const b = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 2);
    expect(() => dryRunRecovery([])).toThrow(InputError);
    expect(() =>
      dryRunRecovery([
        { backup: { share: a[0], sourceVersion: 2 } },
        { backup: { share: a[0], sourceVersion: 2 } },
      ])
    ).toThrow(/duplicate share x=/);
    expect(() =>
      dryRunRecovery([
        { backup: { share: a[0], set: { id: newShareSetId(), threshold: 2, total: 2 }, sourceVersion: 2 } },
        { backup: { share: b[1], set: { id: newShareSetId(), threshold: 2, total: 2 }, sourceVersion: 2 } },
      ])
    ).toThrow(/different splits/);
  });
});

describe('dryRunRecoveryFromFiles / ndjson', () => {
  it('checks mixed plain and encrypted files without printing the secret', async () => {
    await withDir(async (dir) => {
      const secret = Secp256k1.generatePrivateKey();
      const shares = Shamir.splitSecret(secret, 2, 3);
      const set = { id: newShareSetId(), threshold: 2, total: 3 };
      const a = join(dir, 'a.json');
      const b = join(dir, 'b.json');
      await exportShareFile(shares[0], a, { set });
      await exportShareFile(shares[1], b, { set, password: PASSWORD });
      const report = await dryRunRecoveryFromFiles([a, b], { password: PASSWORD });
      expect(report.ok).toBe(true);
      expect(report.encryptedCount).toBe(1);
      expect(report.shares.map((s) => s.encrypted)).toEqual([false, true]);
      expect(report.publicKey).toBe(bytesToHex(getPublicKeyCompressed(secret)));
      expect(JSON.stringify(report)).not.toContain(bytesToHex(secret));
      expect(Recovery.dryRunRecoveryFromFiles).toBe(dryRunRecoveryFromFiles);
    });
  });

  it('checks an NDJSON vault the same way', async () => {
    await withDir(async (dir) => {
      const secret = Secp256k1.generatePrivateKey();
      const shares = Shamir.splitSecret(secret, 2, 3);
      const set = { id: newShareSetId(), threshold: 2, total: 3 };
      const file = join(dir, 'vault.ndjson');
      await exportShareBackupNdjson(
        file,
        shares.slice(0, 2).map((share) => ({ share, set }))
      );
      const report = await dryRunRecoveryFromNdjson(file);
      expect(report.ok).toBe(true);
      expect(report.shareCount).toBe(2);
      expect(report.publicKey).toBe(bytesToHex(getPublicKeyCompressed(secret)));
      expect(JSON.stringify(report)).not.toContain(bytesToHex(secret));
    });
  });

  it('fails closed on too few files', async () => {
    await expect(dryRunRecoveryFromFiles(['only.json'])).rejects.toMatchObject({
      code: 'too-few',
    });
  });
});

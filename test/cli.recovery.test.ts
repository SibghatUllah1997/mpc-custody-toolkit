import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Secp256k1, Shamir } from '../src';
import { exportShareFile, parseArgs, parseRecoverDryRunArgs } from '../src/cli';
import { newShareSetId } from '../src/encoding/share';
import { exportShareBackupNdjson } from '../src/encoding/stream';
import { explainError } from '../src/ux/errors';
import { dryRunRecoveryFromFiles, dryRunRecoveryFromNdjson } from '../src/recovery';
import { bytesToHex } from '../src/utils/bytes';
import { getPublicKeyCompressed } from '../src/crypto/secp256k1';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-cli-dryrun-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('recover-dry-run CLI flags', () => {
  it('parses --files and --stream, and rejects using both or neither', () => {
    expect(parseRecoverDryRunArgs(parseArgs(['recover-dry-run', '--files', 'a.json,b.json']))).toEqual({
      files: ['a.json', 'b.json'],
      password: undefined,
    });
    expect(parseRecoverDryRunArgs(parseArgs(['recover-dry-run', '--stream', 'vault.ndjson'])).stream).toBe(
      'vault.ndjson'
    );
    expect(() => parseRecoverDryRunArgs(parseArgs(['recover-dry-run']))).toThrow(/requires --files/);
    expect(() =>
      parseRecoverDryRunArgs(
        parseArgs(['recover-dry-run', '--files', 'a.json,b.json', '--stream', 'vault.ndjson'])
      )
    ).toThrow(/not both/);
    expect(explainError(new Error('recover-dry-run requires --files <paths> or --stream <ndjson>')).hint).toMatch(
      /never printed/
    );
  });
});

describe('recover-dry-run report', () => {
  it('loads files the same way the command does and hides the secret', async () => {
    await withDir(async (dir) => {
      const secret = Secp256k1.generatePrivateKey();
      const shares = Shamir.splitSecret(secret, 2, 3);
      const set = { id: newShareSetId(), threshold: 2, total: 3 };
      const a = join(dir, 'a.json');
      const b = join(dir, 'b.json');
      await exportShareFile(shares[0], a, { set });
      await exportShareFile(shares[1], b, { set });
      const parsed = parseRecoverDryRunArgs(parseArgs(['recover-dry-run', '--files', `${a},${b}`]));
      const report = await dryRunRecoveryFromFiles(parsed.files!, { password: parsed.password });
      expect(report.ok).toBe(true);
      expect(report.publicKey).toBe(bytesToHex(getPublicKeyCompressed(secret)));
      expect(JSON.stringify(report)).not.toContain(bytesToHex(secret));
    });
  });

  it('loads an NDJSON stream without printing share y values', async () => {
    await withDir(async (dir) => {
      const secret = Secp256k1.generatePrivateKey();
      const shares = Shamir.splitSecret(secret, 2, 3);
      const file = join(dir, 'vault.ndjson');
      await exportShareBackupNdjson(
        file,
        shares.slice(0, 2).map((share) => ({ share }))
      );
      const parsed = parseRecoverDryRunArgs(parseArgs(['recover-dry-run', '--stream', file]));
      const report = await dryRunRecoveryFromNdjson(parsed.stream!);
      expect(report.ok).toBe(true);
      expect(report.shareCount).toBe(2);
      const dumped = JSON.stringify(report);
      expect(dumped).not.toContain(bytesToHex(secret));
      expect(dumped).not.toContain(bytesToHex(shares[0].y));
    });
  });
});

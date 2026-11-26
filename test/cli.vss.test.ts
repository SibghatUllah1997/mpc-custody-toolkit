import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { Secp256k1, Vss } from '../src';
import {
  exportShareFile,
  parseArgs,
  parseSplitArgs,
  parseVerifyShareArgs,
  runSplit,
  runVerifyShare,
} from '../src/cli';
import { InputError } from '../src/errors';
import { explainError } from '../src/ux/errors';
import { bytesToHex, hexToBytes } from '../src/utils/bytes';

function expectCode(fn: () => unknown, code: InputError['code'], pattern: RegExp): void {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).code).toBe(code);
    expect((err as InputError).message).toMatch(pattern);
  }
}

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-cli-vss-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('split --commitments / verify-share CLI', () => {
  it('parses flags and rejects mixed inputs', () => {
    expect(
      parseSplitArgs(parseArgs(['split', '--secret', 'aa', '--threshold', '2', '--total', '3', '--commitments', 'c.json']))
    ).toMatchObject({ threshold: 2, total: 3, commitments: 'c.json' });
    expectCode(
      () =>
        parseVerifyShareArgs(parseArgs(['verify-share', '--commitments', 'c.json', '--file', 's.json', '--x', '1'])),
      'invalid-type',
      /not both/
    );
    expectCode(
      () => parseVerifyShareArgs(parseArgs(['verify-share'])),
      'missing-value',
      /requires --commitments/
    );
    expect(explainError(new Error('verify-share requires --commitments <file>')).hint).toMatch(/split --commitments/);
  });

  it('writes commitments, verifies a share file, and refuses a second write', async () => {
    await withDir(async (dir) => {
      const secret = Secp256k1.generatePrivateKey();
      const commitments = join(dir, 'c.json');
      const shareFile = join(dir, 's1.json');
      const out = await runSplit({
        secret: bytesToHex(secret),
        threshold: 2,
        total: 3,
        commitments,
      });
      expect(Array.isArray(out)).toBe(false);
      if (Array.isArray(out)) return;
      expect(out.publicKey).toBe(bytesToHex(Secp256k1.getPublicKeyCompressed(secret)));
      expect(out.shares).toHaveLength(3);
      const loaded = Vss.decodeFeldmanCommitment(readFileSync(commitments, 'utf8'));
      expect(loaded.points[0]).toBe(out.publicKey);
      await exportShareFile({ x: out.shares[0].x, y: hexToBytes(out.shares[0].y, 32) }, shareFile);
      const ok = await runVerifyShare({ commitments, file: shareFile });
      expect(ok).toEqual({ ok: true, x: out.shares[0].x, publicKey: out.publicKey });
      await expect(runSplit({ secret: bytesToHex(secret), threshold: 2, total: 3, commitments })).rejects.toThrow(
        /EEXIST/
      );
    });
  });

  it('verifies a raw --x/--y share and rejects a tampered y', async () => {
    await withDir(async (dir) => {
      const secret = Secp256k1.generatePrivateKey();
      const commitments = join(dir, 'c.json');
      const out = await runSplit({
        secret: bytesToHex(secret),
        threshold: 2,
        total: 3,
        commitments,
      });
      if (Array.isArray(out)) throw new Error('expected commitments output');
      const ok = await runVerifyShare({
        commitments,
        x: out.shares[1].x,
        y: out.shares[1].y,
      });
      expect(ok.ok).toBe(true);
      const y = out.shares[1].y.slice(0, -2) + (out.shares[1].y.endsWith('00') ? '01' : '00');
      await expect(runVerifyShare({ commitments, x: out.shares[1].x, y })).rejects.toMatchObject({
        code: 'mismatch',
      });
    });
  });
});

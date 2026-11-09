import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { verifyHash } from '../src/crypto/ecdsa';
import { hexToBytes } from '../src/utils/bytes';
import {
  exportShareFile,
  loadShareFiles,
  parseShareJson,
  runThresholdSetup,
  runThresholdSign,
} from '../src/cli';

function digestHex(text: string): string {
  return Buffer.from(sha256(new TextEncoder().encode(text))).toString('hex');
}

describe('CLI parseShareJson', () => {
  it('accepts two well-formed shares', () => {
    const y = '11'.repeat(32);
    const shares = parseShareJson(JSON.stringify([{ x: 1, y }, { x: 2, y: '22'.repeat(32) }]));
    expect(shares).toHaveLength(2);
    expect(shares[0].x).toBe(1);
    expect(shares[0].y.length).toBe(32);
  });

  it('rejects malformed JSON, a short list, and a bad y field', () => {
    expect(() => parseShareJson('{')).toThrow(/Invalid JSON for --shares/);
    expect(() => parseShareJson('[{"x":1,"y":"aa"}]')).toThrow(/at least 2 shares/);
    expect(() =>
      parseShareJson(JSON.stringify([{ x: 1, y: '11'.repeat(32) }, { x: 2, y: 9 }]))
    ).toThrow(/y must be a hex string/);
  });
});

describe('CLI threshold-setup / threshold-sign', () => {
  it('sets up 2-of-3 shares and signs a digest from any pair', () => {
    const setup = runThresholdSetup();
    expect(setup.threshold).toBe(2);
    expect(setup.total).toBe(3);
    expect(setup.shares).toHaveLength(3);

    const hash = digestHex('cli-threshold');
    const pair = [setup.shares[0], setup.shares[2]];
    const signed = runThresholdSign({
      shares: parseShareJson(JSON.stringify(pair)),
      digestHex: hash,
      publicKeyHex: setup.publicKey,
    });

    expect(signed.usedShareXs).toEqual([1, 3]);
    expect(
      verifyHash(hexToBytes(hash, 32), hexToBytes(signed.signature, 64), hexToBytes(setup.publicKey, 33))
    ).toBe(true);
  });

  it('rejects a digest that is not 32 bytes', () => {
    const setup = runThresholdSetup();
    expect(() =>
      runThresholdSign({
        shares: parseShareJson(JSON.stringify(setup.shares.slice(0, 2))),
        digestHex: 'abcd',
      })
    ).toThrow(/expected 32 bytes/);
  });

  it('signs from share files and fails when the public key does not match', async () => {
    const setup = runThresholdSetup();
    const other = runThresholdSetup();
    const dir = mkdtempSync(join(tmpdir(), 'mpc-thr-'));
    try {
      const a = join(dir, 's1.json');
      const b = join(dir, 's2.json');
      await exportShareFile({ x: setup.shares[0].x, y: hexToBytes(setup.shares[0].y, 32) }, a);
      await exportShareFile({ x: setup.shares[1].x, y: hexToBytes(setup.shares[1].y, 32) }, b);
      const shares = await loadShareFiles([a, b]);
      const hash = digestHex('from-files');
      const signed = runThresholdSign({ shares, digestHex: hash, publicKeyHex: setup.publicKey });
      expect(signed.usedShareXs).toEqual([1, 2]);
      expect(() =>
        runThresholdSign({ shares, digestHex: hash, publicKeyHex: other.publicKey })
      ).toThrow(/does not match the expected public key/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

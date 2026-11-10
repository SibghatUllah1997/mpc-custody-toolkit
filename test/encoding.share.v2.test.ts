import { describe, it, expect } from 'vitest';
import { Shamir, Secp256k1 } from '../src';
import { SchemaError } from '../src/schema';
import {
  assertCompatibleShareSet,
  computeShareMacHex,
  decodeShareBackup,
  encodeShare,
  newShareSetId,
  SHARE_BACKUP_VERSION,
  type ShareSetInfo,
} from '../src/encoding/share';
import { bytesToHex } from '../src/utils/bytes';
import { stableStringify } from '../src/utils/json';
import { sha256 } from '@noble/hashes/sha256';

function legacyV1(x: number, yHex: string, withMac: boolean): string {
  const data = { x, y: yHex };
  const checksum = bytesToHex(sha256(new TextEncoder().encode(stableStringify(data)))).slice(0, 16);
  const doc: Record<string, unknown> = { version: 1, type: 'shamir-share', data, checksum: { algo: 'sha256', hex: checksum } };
  if (withMac) doc.mac = { algo: 'hmac-sha256', hex: computeShareMacHex(data) };
  return JSON.stringify(doc);
}

function splitWithSet(t: number, n: number): { shares: Shamir.Share[]; set: ShareSetInfo } {
  const shares = Shamir.splitSecret(Secp256k1.generatePrivateKey(), t, n);
  return { shares, set: { id: newShareSetId(), threshold: t, total: n } };
}

describe('share backup v2', () => {
  it('writes the current version with a mandatory mac', () => {
    const [s] = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 3);
    const obj = JSON.parse(encodeShare(s));
    expect(obj.version).toBe(SHARE_BACKUP_VERSION);
    expect(obj.version).toBe(2);
    expect(obj.mac.hex).toMatch(/^[0-9a-f]{64}$/);
    const noMac = { ...obj };
    delete noMac.mac;
    expect(() => decodeShareBackup(JSON.stringify(noMac))).toThrow(/missing mac/);
  });

  it('carries split metadata and seals it under the checksum and mac', () => {
    const { shares, set } = splitWithSet(2, 3);
    const json = encodeShare(shares[1], set);
    const back = decodeShareBackup(json);
    expect(back.set).toEqual(set);
    expect(back.sourceVersion).toBe(2);
    expect(Buffer.from(back.share.y)).toEqual(Buffer.from(shares[1].y));

    const tampered = JSON.parse(json);
    tampered.data.set.threshold = 3;
    expect(() => decodeShareBackup(JSON.stringify(tampered))).toThrow(/checksum mismatch/);
  });

  it('rejects malformed split metadata on encode', () => {
    const [s] = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 3);
    const good = { id: newShareSetId(), threshold: 2, total: 3 };
    expect(() => encodeShare(s, { ...good, id: 'XYZ' })).toThrow(/set\.id/);
    expect(() => encodeShare(s, { ...good, threshold: 1 })).toThrow(/threshold/);
    expect(() => encodeShare(s, { ...good, total: 9 })).toThrow(/total/);
    expect(() => encodeShare({ ...s, x: 4 }, good)).toThrow(/exceed/);
  });

  it('upgrades v1 files, with or without a mac, and still checks them', () => {
    const [s] = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 2);
    const y = bytesToHex(s.y);
    for (const withMac of [true, false]) {
      const back = decodeShareBackup(legacyV1(s.x, y, withMac));
      expect(back.sourceVersion).toBe(1);
      expect(back.set).toBeUndefined();
      expect(bytesToHex(back.share.y)).toBe(y);
    }
    const bad = JSON.parse(legacyV1(s.x, y, true));
    bad.mac.hex = '00'.repeat(32);
    expect(() => decodeShareBackup(JSON.stringify(bad))).toThrow(/mac mismatch/);
  });

  it('refuses files from a newer toolkit with a clear schema error', () => {
    const [s] = Shamir.splitSecret(Secp256k1.generatePrivateKey(), 2, 2);
    const obj = JSON.parse(encodeShare(s));
    obj.version = 3;
    let err: unknown;
    try {
      decodeShareBackup(JSON.stringify(obj));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SchemaError);
    expect((err as SchemaError).code).toBe('newer-version');
    expect((err as Error).message).toMatch(/unsupported backup version 3/);
  });
});

describe('share set compatibility', () => {
  it('accepts untagged sets and a full tagged set', () => {
    expect(assertCompatibleShareSet([{}, {}])).toBeUndefined();
    const { set } = splitWithSet(2, 3);
    expect(assertCompatibleShareSet([{ set }, { set }])).toEqual(set);
  });

  it('rejects mixed splits, mixed tagging, and too few shares', () => {
    const a = splitWithSet(2, 3).set;
    const b = splitWithSet(2, 3).set;
    expect(() => assertCompatibleShareSet([{ set: a }, { set: b }])).toThrow(/different splits/);
    expect(() => assertCompatibleShareSet([{ set: a }, {}])).toThrow(/with and without/);
    const three = splitWithSet(3, 4).set;
    expect(() => assertCompatibleShareSet([{ set: three }, { set: three }])).toThrow(/needs 3 shares, got 2/);
    expect(() => assertCompatibleShareSet([{ set: a }, { set: { ...a, total: 4 } }])).toThrow(/disagree/);
  });
});

import { describe, expect, it } from 'vitest';
import { Foundation, Secp256k1, Shamir } from '../src';
import { InputError } from '../src/errors';
import { hexToBytes } from '../src/utils/bytes';

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

describe('foundation roundtrip', () => {
  it('keygen, 2-of-3 split, and combine recover the same key', () => {
    const result = Foundation.assertFoundationRoundtrip();
    expect(result.threshold).toBe(2);
    expect(result.total).toBe(3);
    expect(result.usedShareXs).toEqual([1, 2]);
    expect(result.match).toBe(true);
    expect(result.privateKey).toBe(result.recoveredPrivateKey);
    expect(result.publicKey).toBe(result.recoveredPublicKey);
    expect(hexToBytes(result.privateKey, 32).length).toBe(32);
    expect(hexToBytes(result.publicKey, 33).length).toBe(33);
    expect(Secp256k1.isValidPrivateKey(hexToBytes(result.privateKey, 32))).toBe(true);
  });

  it('reconstructs a known secret from a custom share subset', () => {
    const secret = Secp256k1.generatePrivateKey();
    const publicKey = Secp256k1.getPublicKeyCompressed(secret);
    const result = Foundation.runFoundationRoundtrip({
      secret,
      threshold: 3,
      total: 5,
      shareXs: [1, 3, 5],
    });
    expect(result.match).toBe(true);
    expect(result.usedShareXs).toEqual([1, 3, 5]);
    expect(result.privateKey).toBe(
      Buffer.from(secret).toString('hex')
    );
    expect(result.publicKey).toBe(Buffer.from(publicKey).toString('hex'));
  });

  it('still matches when every issued share is combined', () => {
    const result = Foundation.runFoundationRoundtrip({
      threshold: 2,
      total: 4,
      shareXs: [1, 2, 3, 4],
    });
    expect(result.match).toBe(true);
    expect(result.usedShareXs).toEqual([1, 2, 3, 4]);
  });

  it('omits private scalars from the public report', () => {
    const result = Foundation.assertFoundationRoundtrip({ threshold: 2, total: 2 });
    const report = Foundation.publicFoundationReport(result);
    expect(report).toEqual({
      ok: true,
      threshold: 2,
      total: 2,
      usedShareXs: [1, 2],
      publicKey: result.publicKey,
      recoveredPublicKey: result.recoveredPublicKey,
    });
    expect(JSON.stringify(report)).not.toContain(result.privateKey);
  });

  it('rejects a share list shorter than the threshold', () => {
    expectCode(
      () => Foundation.runFoundationRoundtrip({ threshold: 3, total: 5, shareXs: [1, 2] }),
      'too-few',
      /at least 3 indexes/
    );
  });

  it('rejects duplicate and out-of-range share indexes', () => {
    expectCode(
      () => Foundation.runFoundationRoundtrip({ shareXs: [1, 1] }),
      'duplicate',
      /duplicate index 1/
    );
    expectCode(
      () => Foundation.runFoundationRoundtrip({ threshold: 2, total: 3, shareXs: [1, 4] }),
      'invalid-range',
      /1\.\.3/
    );
  });

  it('rejects an invalid secret, k-of-n, and a non-object input', () => {
    expectCode(
      () => Foundation.runFoundationRoundtrip({ secret: new Uint8Array(32) }),
      'invalid-range',
      /32-byte secp256k1 scalar/
    );
    expectCode(
      () => Foundation.runFoundationRoundtrip({ threshold: 1, total: 3 }),
      'invalid-integer',
      /threshold must be an integer >= 2/
    );
    expectCode(
      () => Foundation.runFoundationRoundtrip({ threshold: 2, total: Shamir.MAX_TOTAL_SHARES + 1 }),
      'invalid-range',
      /total must be an integer <= 8/
    );
    expectCode(
      () => Foundation.runFoundationRoundtrip(null as unknown as Foundation.FoundationRoundtripInput),
      'invalid-type',
      /roundtrip input must be an object/
    );
    expectCode(
      () => Foundation.publicFoundationReport(undefined as unknown as Foundation.FoundationRoundtripResult),
      'invalid-type',
      /result must be a foundation roundtrip object/
    );
  });
});

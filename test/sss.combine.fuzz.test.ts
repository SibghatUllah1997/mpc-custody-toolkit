import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { Shamir, encodeShare, decodeShare } from '../src';

const N = Shamir.utils.FIELD_N;
// Fixed seed so a CI failure can be replayed locally; bump numRuns to dig deeper.
const RUNS = { seed: 20261111, numRuns: 200 };

const scalar = fc.bigInt({ min: 1n, max: N - 1n });

/** k-of-n parameters plus a shuffled set of share indexes to pick from. */
const splitCase = fc
  .record({ secret: scalar, k: fc.integer({ min: 2, max: Shamir.MAX_TOTAL_SHARES }) })
  .chain(({ secret, k }) =>
    fc.integer({ min: k, max: Shamir.MAX_TOTAL_SHARES }).chain((n) =>
      fc
        .shuffledSubarray([...Array(n).keys()], { minLength: k, maxLength: n })
        .map((picked) => ({ secret, k, n, picked }))
    )
  );

function hex(b: Uint8Array): string {
  return Buffer.from(b).toString('hex');
}

/** Combine must either return 32 bytes or throw a plain Error with a message. */
function combineOutcome(shares: unknown): { ok: true; out: Uint8Array } | { ok: false; err: Error } {
  try {
    return { ok: true, out: Shamir.combineShares(shares as Shamir.Share[]) };
  } catch (e) {
    return { ok: false, err: e as Error };
  }
}

function expectCleanRejection(shares: unknown, pattern?: RegExp): void {
  const r = combineOutcome(shares);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.err).toBeInstanceOf(Error);
  expect(r.err).not.toBeInstanceOf(TypeError);
  expect(r.err.message.length).toBeGreaterThan(0);
  if (pattern) expect(r.err.message).toMatch(pattern);
}

describe('combineShares fuzz: valid inputs', () => {
  it('recovers the secret from any qualifying subset in any order', () => {
    fc.assert(
      fc.property(splitCase, ({ secret, k, n, picked }) => {
        const shares = Shamir.splitSecret(secret, k, n);
        const out = Shamir.combineShares(picked.map((i) => shares[i]));
        expect(Shamir.utils.bytesToBigIntBE(out)).toBe(secret);
      }),
      RUNS
    );
  });

  it('does not recover the secret from k-1 shares (no detection, just a wrong key)', () => {
    fc.assert(
      fc.property(splitCase.filter((c) => c.k >= 3), ({ secret, k, n, picked }) => {
        const shares = Shamir.splitSecret(secret, k, n);
        const r = combineOutcome(picked.slice(0, k - 1).map((i) => shares[i]));
        if (r.ok) expect(Shamir.utils.bytesToBigIntBE(r.out)).not.toBe(secret);
      }),
      RUNS
    );
  });

  it('a single corrupted y changes the result instead of returning the secret', () => {
    fc.assert(
      fc.property(splitCase, fc.nat(), fc.integer({ min: 0, max: 31 }), fc.integer({ min: 1, max: 255 }),
        ({ secret, k, n, picked }, which, byte, flip) => {
          const shares = Shamir.splitSecret(secret, k, n).map((s) => ({ x: s.x, y: Uint8Array.from(s.y) }));
          const subset = picked.map((i) => shares[i]);
          subset[which % subset.length].y[byte] ^= flip;
          const r = combineOutcome(subset);
          if (r.ok) expect(Shamir.utils.bytesToBigIntBE(r.out)).not.toBe(secret);
        }),
      RUNS
    );
  });
});

describe('combineShares fuzz: duplicate shares', () => {
  it('rejects any subset containing a repeated x, whether y matches or not', () => {
    fc.assert(
      fc.property(splitCase, fc.nat(), fc.boolean(), ({ secret, k, n, picked }, which, sameY) => {
        const shares = Shamir.splitSecret(secret, k, n);
        const subset = picked.map((i) => shares[i]);
        const dup = subset[which % subset.length];
        const y = sameY ? dup.y : Shamir.utils.bigIntToBytesBE((Shamir.utils.bytesToBigIntBE(dup.y) + 1n) % N);
        const withDup = [...subset];
        withDup.splice(which % (withDup.length + 1), 0, { x: dup.x, y });
        expectCleanRejection(withDup, /duplicate share x/);
      }),
      RUNS
    );
  });
});

describe('combineShares fuzz: malformed shares', () => {
  const badX = fc.oneof(
    fc.integer({ min: -1000, max: 0 }),
    fc.integer({ min: Shamir.MAX_TOTAL_SHARES + 1, max: 1_000_000 }),
    fc.double({ noInteger: true }),
    fc.constantFrom(NaN, Infinity, -Infinity),
    fc.constantFrom('1', null, undefined, true, {}, 2n)
  );

  const badY = fc.oneof(
    fc.uint8Array({ maxLength: 31 }),
    fc.uint8Array({ minLength: 33, maxLength: 64 }),
    fc.bigInt({ min: N, max: (1n << 256n) - 1n }).map((v) => Shamir.utils.bigIntToBytesBE(v)),
    fc.constantFrom('00'.repeat(32), null, undefined, 7, [1, 2, 3]),
    fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 32, maxLength: 32 })
  );

  const badEntry = fc.constantFrom(null, undefined, 0, 'share', [], () => 1);

  it('rejects a bad x anywhere in an otherwise valid subset', () => {
    fc.assert(
      fc.property(splitCase, fc.nat(), badX, ({ secret, k, n, picked }, which, x) => {
        const shares = Shamir.splitSecret(secret, k, n);
        const subset: unknown[] = picked.map((i) => shares[i]);
        const at = which % subset.length;
        subset[at] = { x, y: (subset[at] as Shamir.Share).y };
        expectCleanRejection(subset, /share\.x/);
      }),
      RUNS
    );
  });

  it('rejects a bad y anywhere in an otherwise valid subset', () => {
    fc.assert(
      fc.property(splitCase, fc.nat(), badY, ({ secret, k, n, picked }, which, y) => {
        const shares = Shamir.splitSecret(secret, k, n);
        const subset: unknown[] = picked.map((i) => shares[i]);
        const at = which % subset.length;
        subset[at] = { x: (subset[at] as Shamir.Share).x, y };
        expectCleanRejection(subset, /share\.y/);
      }),
      RUNS
    );
  });

  it('rejects non-object entries and non-array input', () => {
    fc.assert(
      fc.property(splitCase, fc.nat(), badEntry, ({ secret, k, n, picked }, which, entry) => {
        const shares = Shamir.splitSecret(secret, k, n);
        const subset: unknown[] = picked.map((i) => shares[i]);
        subset[which % subset.length] = entry;
        expectCleanRejection(subset, /share/);
      }),
      RUNS
    );
    for (const input of [null, undefined, 'shares', 42, {}, [], [{ x: 1, y: new Uint8Array(32) }]]) {
      expectCleanRejection(input, /need at least 2 shares/);
    }
  });

  it('never throws a TypeError for arbitrary junk', () => {
    fc.assert(
      fc.property(fc.array(fc.anything({ withTypedArray: true, withBigInt: true }), { maxLength: 10 }), (junk) => {
        const r = combineOutcome(junk);
        if (!r.ok) expect(r.err).not.toBeInstanceOf(TypeError);
        else expect(r.out).toHaveLength(32);
      }),
      RUNS
    );
  });
});

describe('decodeShare fuzz: corrupted backup files', () => {
  it('a mutated backup either fails to decode or decodes to the same share', () => {
    fc.assert(
      fc.property(scalar, fc.integer({ min: 1, max: 8 }), fc.nat(), fc.integer({ min: 32, max: 126 }),
        (yv, x, pos, code) => {
          const share = { x, y: Shamir.utils.bigIntToBytesBE(yv) };
          const json = encodeShare(share);
          const at = pos % json.length;
          const mutated = json.slice(0, at) + String.fromCharCode(code) + json.slice(at + 1);
          let decoded: Shamir.Share | undefined;
          try {
            decoded = decodeShare(mutated);
          } catch (e) {
            expect(e).toBeInstanceOf(Error);
            return;
          }
          expect(decoded.x).toBe(share.x);
          expect(hex(decoded.y)).toBe(hex(share.y));
        }),
      RUNS
    );
  });
});

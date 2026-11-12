import { describe, expect, it } from 'vitest';
import { InputError } from '../src/errors';
import { Secp256k1, Shamir, Tx } from '../src';
import { parseDecimalInteger } from '../src/policy/amount';
import { bytesToHex, hexToBytes, normalizeHex, strip0x } from '../src/utils/bytes';

function expectInput(fn: () => unknown, code: InputError['code'], pattern: RegExp): InputError {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(InputError);
  const err = caught as InputError;
  expect(err.code).toBe(code);
  expect(err.message).toMatch(pattern);
  return err;
}

describe('hex/bytes InputError codes', () => {
  it('rejects a non-string, odd length, and non-hex characters with codes', () => {
    expectInput(() => normalizeHex(true as unknown as string), 'invalid-type', /hex string/);
    expectInput(() => normalizeHex('abc'), 'invalid-hex', /even number/);
    expectInput(() => normalizeHex('zz'), 'invalid-hex', /non-hex/);
    expectInput(() => hexToBytes('1234', 4), 'invalid-length', /expected 4 bytes, got 2/);
    expectInput(() => bytesToHex('aa' as unknown as Uint8Array), 'invalid-type', /Uint8Array/);
    expectInput(() => strip0x(9 as unknown as string), 'invalid-type', /hex string/);
  });
});

describe('Shamir InputError codes', () => {
  it('codes threshold, n, duplicate x, and short lists', () => {
    const secret = Secp256k1.generatePrivateKey();
    expectInput(() => Shamir.splitSecret(secret, 1, 2), 'invalid-integer', /threshold/);
    expectInput(() => Shamir.splitSecret(secret, 2, 9), 'invalid-range', /totalShares must be <= 8/);
    expectInput(() => Shamir.combineShares([]), 'too-few', /at least 2 shares/);
    const [s1, s2] = Shamir.splitSecret(secret, 2, 2);
    expectInput(() => Shamir.combineShares([s1, { x: s1.x, y: s2.y }]), 'duplicate', /duplicate share x/);
    expectInput(
      () => Shamir.splitSecret({ not: 'a key' } as unknown as Uint8Array, 2, 2),
      'invalid-type',
      /hex, bytes, or a bigint/
    );
  });
});

describe('transaction and amount InputError codes', () => {
  it('codes a bad address length, odd data, and a padded value', () => {
    const tx = { from: 'aa', to: 'bb', value: '1', data: '' };
    expectInput(() => Tx.freezeTransaction({ ...tx, to: '11'.repeat(33) }), 'invalid-length', /to must be 1\.\.32/);
    expectInput(() => Tx.freezeTransaction({ ...tx, data: 'abc' }), 'invalid-hex', /even number/);
    expectInput(() => Tx.freezeTransaction({ ...tx, value: '01' }), 'invalid-integer', /decimal integer/);
    expectInput(() => parseDecimalInteger('-1', 'n'), 'invalid-integer', /decimal integer/);
  });
});

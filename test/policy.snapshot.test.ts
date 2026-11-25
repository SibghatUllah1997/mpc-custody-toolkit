import { describe, expect, it } from 'vitest';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { InputError } from '../src/errors';
import {
  decodePolicySnapshot,
  encodePolicySnapshot,
  signPolicySnapshot,
  verifyPolicySnapshot,
  type Policy,
} from '../src/policy';
import { SchemaError } from '../src/schema';
import { bytesToHex } from '../src/utils/bytes';

const policy: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '100', allowTo: ['bb22'] }],
};

describe('signPolicySnapshot / verifyPolicySnapshot', () => {
  it('round-trips a signed snapshot through JSON', () => {
    const keys = generateKeyPair();
    const now = new Date('2026-11-24T08:00:00.000Z');
    const snap = signPolicySnapshot({ policy, privateKey: keys.privateKey, now });
    expect(snap.publicKey).toBe(bytesToHex(keys.publicKey));
    expect(snap.createdAt).toBe('2026-11-24T08:00:00.000Z');
    expect(snap.policy.id).toBe('vault-main');
    const json = encodePolicySnapshot(snap);
    const decoded = decodePolicySnapshot(json, { publicKey: keys.publicKey, now });
    expect(decoded.digest).toBe(snap.digest);
    expect(decoded.signature).toBe(snap.signature);
    expect(decoded.policy.limits[0].maxValue).toBe('100');
  });

  it('refuses a hand-edited limit even if the digest field is left alone', () => {
    const keys = generateKeyPair();
    const snap = signPolicySnapshot({
      policy,
      privateKey: keys.privateKey,
      now: new Date('2026-11-24T08:00:00.000Z'),
    });
    const edited = JSON.parse(encodePolicySnapshot(snap));
    edited.policy.limits[0].maxValue = '999999';
    expect(() => decodePolicySnapshot(JSON.stringify(edited))).toThrow(InputError);
    expect(() => decodePolicySnapshot(JSON.stringify(edited))).toThrow(/digest mismatch/);
  });

  it('refuses a snapshot signed by a different key', () => {
    const keys = generateKeyPair();
    const other = generateKeyPair();
    const snap = signPolicySnapshot({
      policy,
      privateKey: keys.privateKey,
      now: new Date('2026-11-24T08:00:00.000Z'),
    });
    expect(() => verifyPolicySnapshot(snap, { publicKey: other.publicKey })).toThrow(
      /does not match the trusted key/
    );
  });

  it('refuses an expired snapshot', () => {
    const keys = generateKeyPair();
    const now = new Date('2026-11-24T08:00:00.000Z');
    const snap = signPolicySnapshot({
      policy,
      privateKey: keys.privateKey,
      now,
      expiresAt: '2026-11-24T09:00:00.000Z',
    });
    expect(snap.expiresAt).toBe('2026-11-24T09:00:00.000Z');
    expect(() =>
      verifyPolicySnapshot(snap, { now: new Date('2026-11-24T09:00:00.000Z') })
    ).toThrow(/has passed/);
    expect(verifyPolicySnapshot(snap, { now: new Date('2026-11-24T08:59:59.000Z') }).policy.id).toBe(
      'vault-main'
    );
  });

  it('still encodes a snapshot after its deadline, and decode refuses it', () => {
    const keys = generateKeyPair();
    const now = new Date('2026-11-24T08:00:00.000Z');
    const snap = signPolicySnapshot({
      policy,
      privateKey: keys.privateKey,
      now,
      expiresAt: '2026-11-24T09:00:00.000Z',
    });
    const json = encodePolicySnapshot(snap);
    expect(json).toContain('"expiresAt": "2026-11-24T09:00:00.000Z"');
    expect(() => decodePolicySnapshot(json)).toThrow(/has passed/);
    expect(decodePolicySnapshot(json, { now }).digest).toBe(snap.digest);
  });

  it('rejects unknown fields and a newer schema version', () => {
    const keys = generateKeyPair();
    const snap = signPolicySnapshot({
      policy,
      privateKey: keys.privateKey,
      now: new Date('2026-11-24T08:00:00.000Z'),
    });
    const extra = JSON.parse(encodePolicySnapshot(snap));
    extra.note = 'hidden';
    expect(() => decodePolicySnapshot(JSON.stringify(extra))).toThrow(/unexpected snapshot field/);
    try {
      decodePolicySnapshot(JSON.stringify({ version: 9, type: 'policy-snapshot', policy: {} }));
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SchemaError);
      expect((err as SchemaError).code).toBe('newer-version');
    }
  });
});

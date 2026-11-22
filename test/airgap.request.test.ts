import { describe, expect, it } from 'vitest';
import {
  AIRGAP_REQUEST_TYPE,
  airgapChecksum,
  createSignRequest,
  decodeSignRequest,
  describeAirgapRequest,
  encodeSignRequest,
} from '../src/airgap';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { publicKeyToAddress } from '../src/eip';
import { InputError } from '../src/errors';
import { SchemaError } from '../src/schema';
import { transactionDigest, type Transaction } from '../src/tx';
import { bytesToHex } from '../src/utils/bytes';

const { publicKey } = generateKeyPair();
const pub = bytesToHex(publicKey);
const tx: Transaction = { from: 'aa11', to: 'bb22', value: '250', data: '0abc' };
const digest = 'ab'.repeat(32);

function expectCode(fn: () => unknown, code: InputError['code'], pattern?: RegExp): void {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).code).toBe(code);
    if (pattern) expect((err as InputError).message).toMatch(pattern);
  }
}

/** Edit a request file and re-seal it, as a careless or hostile tool might. */
function reseal(json: string, edit: (doc: Record<string, unknown>) => void): string {
  const doc = JSON.parse(json) as Record<string, unknown>;
  edit(doc);
  doc.checksum = airgapChecksum(AIRGAP_REQUEST_TYPE, doc);
  return JSON.stringify(doc);
}

describe('createSignRequest', () => {
  it('derives the digest from the transaction', () => {
    const req = createSignRequest({ publicKeyHex: `0x${pub.toUpperCase()}`, tx: { ...tx, from: '0xAA11' }, asset: 'ETH' });
    expect(req.kind).toBe('transaction');
    expect(req.digest).toBe(bytesToHex(transactionDigest(tx)));
    expect(req.publicKey).toBe(pub);
    expect(req.tx).toEqual(tx);
    expect(req.id).toMatch(/^[0-9a-f]{16}$/);
    expect(Object.isFrozen(req)).toBe(true);
  });

  it('accepts a raw digest and a fixed id', () => {
    const req = createSignRequest({ publicKeyHex: pub, digestHex: `0x${digest}`, id: '0123456789abcdef', note: 'cold wallet sweep' });
    expect(req).toEqual({ id: '0123456789abcdef', kind: 'digest', digest, publicKey: pub, note: 'cold wallet sweep' });
  });

  it('gives each request a fresh id', () => {
    const a = createSignRequest({ publicKeyHex: pub, digestHex: digest });
    const b = createSignRequest({ publicKeyHex: pub, digestHex: digest });
    expect(a.id).not.toBe(b.id);
  });

  it('wants exactly one of tx or digest', () => {
    expectCode(() => createSignRequest({ publicKeyHex: pub }), 'missing-value', /exactly one/);
    expectCode(() => createSignRequest({ publicKeyHex: pub, tx, digestHex: digest }), 'missing-value', /exactly one/);
  });

  it('rejects bad keys, digests, ids, assets and notes', () => {
    expectCode(() => createSignRequest({ publicKeyHex: pub.slice(2), digestHex: digest }), 'invalid-length');
    expectCode(() => createSignRequest({ publicKeyHex: `02${'00'.repeat(32)}`, digestHex: digest }), 'invalid-range');
    expectCode(() => createSignRequest({ publicKeyHex: pub, digestHex: 'ab'.repeat(31) }), 'invalid-length');
    expectCode(() => createSignRequest({ publicKeyHex: pub, digestHex: digest, id: 'ABCDEF0123456789' }), 'invalid-hex');
    expectCode(() => createSignRequest({ publicKeyHex: pub, digestHex: digest, asset: 'ETH' }), 'invalid-type', /asset only/);
    expectCode(() => createSignRequest({ publicKeyHex: pub, tx, asset: 'E T H' }), 'invalid-type', /asset/);
    expectCode(() => createSignRequest({ publicKeyHex: pub, tx, note: 'x'.repeat(257) }), 'invalid-type', /note/);
    expectCode(() => createSignRequest({ publicKeyHex: pub, tx, note: 'pay\u202eevil' }), 'invalid-type', /note/);
    expectCode(() => createSignRequest({ publicKeyHex: pub, tx, note: 'line\nbreak' }), 'invalid-type', /note/);
    expectCode(
      () => createSignRequest({ publicKeyHex: pub, digestHex: digest, expiresAt: '2026-11-21T08:00:00+05:00' }),
      'invalid-type',
      /UTC timestamp/
    );
  });

  it('stores expiresAt as a millisecond UTC timestamp', () => {
    const req = createSignRequest({
      publicKeyHex: pub,
      digestHex: digest,
      id: '0123456789abcdef',
      expiresAt: '2026-11-21T08:00:00Z',
    });
    expect(req.expiresAt).toBe('2026-11-21T08:00:00.000Z');
  });

  it('rejects extra fields inside tx', () => {
    expectCode(
      () => createSignRequest({ publicKeyHex: pub, tx: { ...tx, gas: '1' } as unknown as Transaction }),
      'invalid-type',
      /unexpected tx field: gas/
    );
  });
});

describe('encodeSignRequest / decodeSignRequest', () => {
  it('round-trips a request that carries an expiry', () => {
    const req = createSignRequest({
      publicKeyHex: pub,
      tx,
      expiresAt: '2026-11-21T08:00:00.000Z',
      id: 'aaaaaaaaaaaaaaaa',
    });
    const json = encodeSignRequest(req);
    expect(JSON.parse(json).version).toBe(2);
    expect(JSON.parse(json).expiresAt).toBe('2026-11-21T08:00:00.000Z');
    expect(decodeSignRequest(json)).toEqual(req);
  });

  it('upgrades a v1 file and does not invent an expiry', () => {
    const body: Record<string, unknown> = {
      version: 1,
      id: 'bbbbbbbbbbbbbbbb',
      kind: 'digest',
      digest,
      publicKey: pub,
    };
    const v1 = {
      type: AIRGAP_REQUEST_TYPE,
      ...body,
      checksum: airgapChecksum(AIRGAP_REQUEST_TYPE, body),
    };
    const loaded = decodeSignRequest(JSON.stringify(v1));
    expect(loaded).toEqual({
      id: 'bbbbbbbbbbbbbbbb',
      kind: 'digest',
      digest,
      publicKey: pub,
    });
    expect(loaded.expiresAt).toBeUndefined();
  });

  it('round-trips transaction and digest requests', () => {
    const a = createSignRequest({ publicKeyHex: pub, tx, asset: 'ETH', note: '' });
    const b = createSignRequest({ publicKeyHex: pub, digestHex: digest });
    expect(decodeSignRequest(encodeSignRequest(a))).toEqual(a);
    expect(decodeSignRequest(encodeSignRequest(b))).toEqual(b);
    const doc = JSON.parse(encodeSignRequest(b));
    expect(doc.type).toBe('airgap-sign-request');
    expect(doc.version).toBe(2);
    expect(doc.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses to encode a request whose digest was swapped', () => {
    const req = createSignRequest({ publicKeyHex: pub, tx });
    expectCode(() => encodeSignRequest({ ...req, digest }), 'mismatch', /does not match its transaction/);
  });

  it('catches a damaged file through the checksum', () => {
    const json = encodeSignRequest(createSignRequest({ publicKeyHex: pub, tx }));
    const edited = json.replace('"value": "250"', '"value": "2500"');
    expect(edited).not.toBe(json);
    expectCode(() => decodeSignRequest(edited), 'mismatch', /checksum/);
    expectCode(() => decodeSignRequest(json.replace(/"checksum": "[0-9a-f]+"/, '"checksum": 5')), 'mismatch', /checksum/);
  });

  it('catches a re-sealed file that changed the tx but not the digest', () => {
    const json = encodeSignRequest(createSignRequest({ publicKeyHex: pub, tx }));
    const forged = reseal(json, (doc) => {
      (doc.tx as Transaction).to = 'cc33';
    });
    expectCode(() => decodeSignRequest(forged), 'mismatch', /digest does not match/);
  });

  it('rejects unknown fields, a wrong kind, and kind/tx mix-ups', () => {
    const txJson = encodeSignRequest(createSignRequest({ publicKeyHex: pub, tx }));
    const digestJson = encodeSignRequest(createSignRequest({ publicKeyHex: pub, digestHex: digest }));
    expectCode(() => decodeSignRequest(reseal(txJson, (d) => (d.memo = 'hi'))), 'invalid-type', /unexpected request field: memo/);
    expectCode(() => decodeSignRequest(reseal(txJson, (d) => (d.kind = 'message'))), 'invalid-type', /kind/);
    expectCode(() => decodeSignRequest(reseal(txJson, (d) => delete d.tx)), 'missing-value', /missing tx/);
    expectCode(() => decodeSignRequest(reseal(digestJson, (d) => (d.tx = tx))), 'invalid-type', /must not carry tx/);
    expectCode(() => decodeSignRequest(reseal(digestJson, (d) => (d.asset = 'ETH'))), 'invalid-type', /asset only/);
  });

  it('rejects other document types and newer versions', () => {
    expect(() => decodeSignRequest('nope')).toThrow(SchemaError);
    expect(() => decodeSignRequest(JSON.stringify({ type: 'shamir-share', version: 2 }))).toThrow(/unsupported air-gap request type/);
    const json = encodeSignRequest(createSignRequest({ publicKeyHex: pub, digestHex: digest }));
    expect(() => decodeSignRequest(reseal(json, (d) => (d.version = 3)))).toThrow(/newer toolkit/);
  });
});

describe('describeAirgapRequest', () => {
  it('shows the transfer, request id, key and note', () => {
    const req = createSignRequest({ publicKeyHex: pub, tx, asset: 'ETH', note: 'monthly payout', id: '00000000000000aa' });
    const prompt = describeAirgapRequest(req);
    expect(prompt.title).toBe('Air-gap signing request');
    expect(prompt.digestHex).toBe(req.digest);
    expect(prompt.text).toContain('250 ETH');
    expect(prompt.text).toContain('00000000000000aa');
    expect(prompt.text).toContain(pub);
    expect(prompt.text).toContain(publicKeyToAddress(pub));
    expect(prompt.text).toContain('monthly payout');
    expect(Object.isFrozen(prompt.lines)).toBe(true);
  });

  it('shows the expiry when the request has one', () => {
    const req = createSignRequest({
      publicKeyHex: pub,
      digestHex: digest,
      id: '00000000000000bb',
      expiresAt: '2026-11-21T08:00:00Z',
    });
    expect(describeAirgapRequest(req).text).toContain('2026-11-21T08:00:00.000Z');
  });

  it('falls back to a digest prompt and refuses a mismatched digest', () => {
    const req = createSignRequest({ publicKeyHex: pub, digestHex: digest });
    expect(describeAirgapRequest(req).title).toBe('Air-gap digest signing request');
    const txReq = createSignRequest({ publicKeyHex: pub, tx });
    expect(() => describeAirgapRequest({ ...txReq, digest })).toThrow(/does not match/);
  });
});

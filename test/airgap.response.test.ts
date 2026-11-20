import { describe, expect, it } from 'vitest';
import {
  AIRGAP_RESPONSE_TYPE,
  airgapChecksum,
  createSignRequest,
  decodeSignRequest,
  decodeSignResponse,
  encodeSignRequest,
  encodeSignResponse,
  signAirgapRequest,
  verifyAirgapResponse,
} from '../src/airgap';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { InputError } from '../src/errors';
import { verifyTransaction, type Transaction } from '../src/tx';
import { bytesToHex, hexToBytes } from '../src/utils/bytes';

const signer = generateKeyPair();
const other = generateKeyPair();
const pub = bytesToHex(signer.publicKey);
const tx: Transaction = { from: 'aa11', to: 'bb22', value: '250', data: '' };

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

function reseal(json: string, edit: (doc: Record<string, unknown>) => void): string {
  const doc = JSON.parse(json) as Record<string, unknown>;
  edit(doc);
  doc.checksum = airgapChecksum(AIRGAP_RESPONSE_TYPE, doc);
  return JSON.stringify(doc);
}

describe('air-gap signing round trip', () => {
  it('exports, signs offline, imports and verifies', () => {
    const request = createSignRequest({ publicKeyHex: pub, tx, asset: 'ETH' });
    const requestFile = encodeSignRequest(request);

    // offline machine
    const offlineReq = decodeSignRequest(requestFile);
    const responseFile = encodeSignResponse(signAirgapRequest(offlineReq, signer.privateKey));

    // back online
    const response = decodeSignResponse(responseFile);
    const report = verifyAirgapResponse(request, response);
    expect(report).toEqual({ ok: true, requestId: request.id, digest: request.digest, publicKey: pub, codes: [] });
    // the signature is a normal transaction signature
    expect(verifyTransaction(tx, hexToBytes(response.signature), signer.publicKey)).toBe(true);
  });

  it('refuses to sign with a key the request did not name', () => {
    const request = createSignRequest({ publicKeyHex: pub, digestHex: '11'.repeat(32) });
    expectCode(() => signAirgapRequest(request, other.privateKey), 'mismatch', /does not match/);
  });
});

describe('verifyAirgapResponse', () => {
  const request = createSignRequest({ publicKeyHex: pub, tx });
  const good = signAirgapRequest(request, signer.privateKey);

  it('flags a response for a different request', () => {
    const otherReq = createSignRequest({ publicKeyHex: pub, tx: { ...tx, value: '251' } });
    const res = signAirgapRequest(otherReq, signer.privateKey);
    const report = verifyAirgapResponse(request, res);
    expect(report.ok).toBe(false);
    expect(report.codes).toEqual(['request-id-mismatch', 'digest-mismatch', 'bad-signature']);
  });

  it('flags a valid signature replayed under the right id but wrong digest', () => {
    const report = verifyAirgapResponse(request, { ...good, digest: '00'.repeat(32) });
    expect(report.codes).toEqual(['digest-mismatch']);
  });

  it('flags a signature from another key even if the response claims ours', () => {
    const forgedReq = createSignRequest({ id: request.id, publicKeyHex: bytesToHex(other.publicKey), tx });
    const forged = signAirgapRequest(forgedReq, other.privateKey);
    expect(verifyAirgapResponse(request, { ...forged, publicKey: pub }).codes).toEqual(['bad-signature']);
    expect(verifyAirgapResponse(request, forged).codes).toEqual(['public-key-mismatch', 'bad-signature']);
  });

  it('flags a tampered signature', () => {
    const sig = hexToBytes(good.signature);
    sig[10] ^= 1;
    expect(verifyAirgapResponse(request, { ...good, signature: bytesToHex(sig) }).codes).toEqual(['bad-signature']);
  });
});

describe('encodeSignResponse / decodeSignResponse', () => {
  const request = createSignRequest({ publicKeyHex: pub, tx });
  const res = signAirgapRequest(request, signer.privateKey);

  it('round-trips and normalizes hex', () => {
    const json = encodeSignResponse({ ...res, signature: `0x${res.signature.toUpperCase()}` });
    expect(decodeSignResponse(json)).toEqual(res);
  });

  it('rejects damage, unknown fields and malformed values', () => {
    const json = encodeSignResponse(res);
    expectCode(() => decodeSignResponse(json.replace(res.signature, res.signature.replace(/.$/, (c) => (c === '0' ? '1' : '0')))), 'mismatch', /checksum/);
    expectCode(() => decodeSignResponse(reseal(json, (d) => (d.extra = 1))), 'invalid-type', /unexpected response field/);
    expectCode(() => decodeSignResponse(reseal(json, (d) => (d.signature = 'ab'))), 'invalid-length');
    expectCode(() => decodeSignResponse(reseal(json, (d) => (d.requestId = 'xyz'))), 'invalid-hex');
    expectCode(() => decodeSignResponse(reseal(json, (d) => (d.digest = 7))), 'invalid-type');
    expect(() => decodeSignResponse(reseal(json, (d) => (d.type = 'airgap-sign-request')))).toThrow(/unsupported air-gap response type/);
  });
});

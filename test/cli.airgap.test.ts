import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  parseAirgapRequestArgs,
  parseAirgapSignArgs,
  parseArgs,
  runAirgapRequest,
  runAirgapSign,
  runAirgapVerify,
} from '../src/cli';
import { AIRGAP_RESPONSE_TYPE, airgapChecksum } from '../src/airgap';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { InputError } from '../src/errors';
import { renderCliError } from '../src/ux/errors';
import { bytesToHex } from '../src/utils/bytes';

const signer = generateKeyPair();
const other = generateKeyPair();
const pub = bytesToHex(signer.publicKey);

function workdir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'airgap-'));
  writeFileSync(join(dir, 'signer.key'), `${bytesToHex(signer.privateKey)}\n`);
  writeFileSync(join(dir, 'other.key'), bytesToHex(other.privateKey));
  return dir;
}

async function expectCode(p: Promise<unknown>, code: InputError['code'], pattern: RegExp): Promise<void> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(InputError);
  expect((err as InputError).code).toBe(code);
  expect((err as InputError).message).toMatch(pattern);
}

async function makeRequest(dir: string) {
  return runAirgapRequest(
    parseAirgapRequestArgs(
      parseArgs(['airgap-request', '--pubkey', pub, '--from', 'aa11', '--to', 'bb22', '--value', '250', '--asset', 'ETH', '--out', join(dir, 'req.json')])
    )
  );
}

describe('airgap CLI flow', () => {
  it('request -> sign -> verify', async () => {
    const dir = workdir();
    const req = await makeRequest(dir);
    expect(req).toMatchObject({ ok: true, kind: 'transaction', publicKey: pub });

    const shown: string[] = [];
    const asked: string[] = [];
    const signed = await runAirgapSign(
      parseAirgapSignArgs(parseArgs(['airgap-sign', '--request', join(dir, 'req.json'), '--key-file', join(dir, 'signer.key'), '--out', join(dir, 'res.json')])),
      { show: (t) => shown.push(t), confirm: async (q) => (asked.push(q), ' Y ') }
    );
    expect(signed.requestId).toBe(req.id);
    expect(asked).toEqual(['Sign this request? [y/N] ']);
    expect(shown[0]).toContain('250 ETH');
    expect(shown[0]).toContain(req.id);
    expect(readFileSync(join(dir, 'res.json'), 'utf8')).not.toContain(bytesToHex(signer.privateKey));

    const report = await runAirgapVerify({ request: join(dir, 'req.json'), response: join(dir, 'res.json') });
    expect(report).toMatchObject({ ok: true, requestId: req.id, codes: [] });
  });

  it('accepts a raw digest request', async () => {
    const dir = workdir();
    const out = await runAirgapRequest(
      parseAirgapRequestArgs(parseArgs(['airgap-request', '--pubkey', pub, '--digest', '0x' + 'cd'.repeat(32), '--note', 'test sweep', '--out', join(dir, 'd.json')]))
    );
    expect(out).toMatchObject({ kind: 'digest', digest: 'cd'.repeat(32) });
  });

  it('never overwrites request or response files', async () => {
    const dir = workdir();
    await makeRequest(dir);
    await expect(makeRequest(dir)).rejects.toThrow(/EEXIST/);
    const sign = parseAirgapSignArgs(parseArgs(['airgap-sign', '--request', join(dir, 'req.json'), '--key-file', join(dir, 'signer.key'), '--out', join(dir, 'req.json'), '--yes']));
    await expect(runAirgapSign(sign, { show: () => {} })).rejects.toThrow(/EEXIST/);
  });

  it('needs a yes, and stops on anything else', async () => {
    const dir = workdir();
    await makeRequest(dir);
    const sign = parseAirgapSignArgs(parseArgs(['airgap-sign', '--request', join(dir, 'req.json'), '--key-file', join(dir, 'signer.key'), '--out', join(dir, 'res.json')]));
    await expectCode(runAirgapSign(sign, { show: () => {} }), 'missing-value', /needs --yes/);
    await expectCode(runAirgapSign(sign, { show: () => {}, confirm: async () => 'n' }), 'mismatch', /cancelled/);
    await expectCode(runAirgapSign(sign, { show: () => {}, confirm: async () => '' }), 'mismatch', /cancelled/);
    expect(() => readFileSync(join(dir, 'res.json'))).toThrow(/ENOENT/);
    const signed = await runAirgapSign({ ...sign, yes: true }, { show: () => {} });
    expect(signed.ok).toBe(true);
  });

  it('refuses the wrong key file without writing a response', async () => {
    const dir = workdir();
    await makeRequest(dir);
    const sign = parseAirgapSignArgs(parseArgs(['airgap-sign', '--request', join(dir, 'req.json'), '--key-file', join(dir, 'other.key'), '--out', join(dir, 'res.json'), '--yes']));
    await expectCode(runAirgapSign(sign, { show: () => {} }), 'mismatch', /does not match the request public key/);
    expect(() => readFileSync(join(dir, 'res.json'))).toThrow(/ENOENT/);
  });

  it('reports a response that does not belong to the request', async () => {
    const dir = workdir();
    await makeRequest(dir);
    await runAirgapSign(
      parseAirgapSignArgs(parseArgs(['airgap-sign', '--request', join(dir, 'req.json'), '--key-file', join(dir, 'signer.key'), '--out', join(dir, 'res.json'), '--yes'])),
      { show: () => {} }
    );
    const doc = JSON.parse(readFileSync(join(dir, 'res.json'), 'utf8'));
    doc.digest = '00'.repeat(32);
    doc.checksum = airgapChecksum(AIRGAP_RESPONSE_TYPE, doc);
    writeFileSync(join(dir, 'bad.json'), JSON.stringify(doc));
    const report = await runAirgapVerify({ request: join(dir, 'req.json'), response: join(dir, 'bad.json') });
    expect(report.ok).toBe(false);
    expect(report.codes).toEqual(['digest-mismatch']);
  });
});

describe('airgap argument parsing', () => {
  it('rejects private keys on argv with a hint', () => {
    for (const flag of ['--key', '--private-key', '--secret']) {
      let err: unknown;
      try {
        parseAirgapSignArgs(parseArgs(['airgap-sign', flag, 'ab'.repeat(32), '--request', 'r', '--key-file', 'k', '--out', 'o']));
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(InputError);
      expect(renderCliError(err, { json: false, color: false })).toMatch(/--key-file/);
    }
  });

  it('requires the files it reads and writes', () => {
    expect(() => parseAirgapSignArgs(parseArgs(['airgap-sign', '--key-file', 'k', '--out', 'o']))).toThrow(/--request/);
    expect(() => parseAirgapSignArgs(parseArgs(['airgap-sign', '--request', 'r', '--out', 'o']))).toThrow(/--key-file/);
    expect(() => parseAirgapRequestArgs(parseArgs(['airgap-request', '--pubkey', pub, '--digest', 'ab']))).toThrow(/--out/);
    expect(() => parseAirgapRequestArgs(parseArgs(['airgap-request', '--digest', 'ab', '--out', 'o']))).toThrow(/--pubkey/);
  });

  it('wants exactly one payload source', () => {
    const base = ['airgap-request', '--pubkey', pub, '--out', 'o'];
    expect(() => parseAirgapRequestArgs(parseArgs(base))).toThrow(/exactly one/);
    expect(() => parseAirgapRequestArgs(parseArgs([...base, '--digest', 'ab'.repeat(32), '--tx', '{"from":"aa","to":"bb","value":"1"}']))).toThrow(/exactly one/);
    expect(() => parseAirgapRequestArgs(parseArgs([...base, '--from', 'aa', '--value', '1']))).toThrow(/--from, --to, and --value together/);
  });

  it('rejects --ttl and --expires together', () => {
    expect(() =>
      parseAirgapRequestArgs(
        parseArgs(['airgap-request', '--pubkey', pub, '--digest', 'ab'.repeat(32), '--out', 'o', '--ttl', '1h', '--expires', '2026-11-21T08:00:00Z'])
      )
    ).toThrow(/only one of --ttl or --expires/);
  });
});

describe('airgap request expiry', () => {
  const now = new Date('2026-11-21T07:00:00.000Z');

  it('writes expiresAt from --ttl against a fixed now', async () => {
    const dir = workdir();
    const out = await runAirgapRequest(
      parseAirgapRequestArgs(
        parseArgs(['airgap-request', '--pubkey', pub, '--from', 'aa11', '--to', 'bb22', '--value', '250', '--ttl', '1h', '--out', join(dir, 'req.json')])
      ),
      { now }
    );
    expect(out.expiresAt).toBe('2026-11-21T08:00:00.000Z');
    expect(JSON.parse(readFileSync(join(dir, 'req.json'), 'utf8')).expiresAt).toBe('2026-11-21T08:00:00.000Z');
  });

  it('refuses to create a request whose --expires is already past', async () => {
    const dir = workdir();
    await expectCode(
      runAirgapRequest(
        parseAirgapRequestArgs(
          parseArgs([
            'airgap-request',
            '--pubkey',
            pub,
            '--digest',
            'cd'.repeat(32),
            '--expires',
            '2026-11-21T06:00:00Z',
            '--out',
            join(dir, 'old.json'),
          ])
        ),
        { now }
      ),
      'expired',
      /has passed/
    );
  });

  it('refuses to sign or verify after the deadline', async () => {
    const dir = workdir();
    await runAirgapRequest(
      parseAirgapRequestArgs(
        parseArgs(['airgap-request', '--pubkey', pub, '--from', 'aa11', '--to', 'bb22', '--value', '250', '--ttl', '1h', '--out', join(dir, 'req.json')])
      ),
      { now }
    );
    await expectCode(
      runAirgapSign(
        parseAirgapSignArgs(
          parseArgs(['airgap-sign', '--request', join(dir, 'req.json'), '--key-file', join(dir, 'signer.key'), '--out', join(dir, 'res.json'), '--yes'])
        ),
        { show: () => {}, now: new Date('2026-11-21T08:00:00.000Z') }
      ),
      'expired',
      /has passed/
    );
    const signed = await runAirgapSign(
      parseAirgapSignArgs(
        parseArgs(['airgap-sign', '--request', join(dir, 'req.json'), '--key-file', join(dir, 'signer.key'), '--out', join(dir, 'res.json'), '--yes'])
      ),
      { show: () => {}, now }
    );
    expect(signed.ok).toBe(true);
    const late = await runAirgapVerify(
      { request: join(dir, 'req.json'), response: join(dir, 'res.json') },
      { now: new Date('2026-11-21T09:00:00.000Z') }
    );
    expect(late).toMatchObject({ ok: false, codes: ['expired'] });
  });
});

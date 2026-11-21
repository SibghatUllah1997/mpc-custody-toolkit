import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  appendSpentRequest,
  computeSpentChecksumHex,
  decodeSpentRequest,
  encodeSpentRequest,
  findSpentRequest,
  readSpentLog,
  SPENT_REQUEST_TYPE,
  type SpentRequestDraft,
} from '../src/airgap';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { InputError } from '../src/errors';
import { bytesToHex } from '../src/utils/bytes';

const signer = generateKeyPair();
const pub = bytesToHex(signer.publicKey);
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

async function expectAsyncCode(p: Promise<unknown>, code: InputError['code'], pattern?: RegExp): Promise<void> {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(InputError);
  expect((err as InputError).code).toBe(code);
  if (pattern) expect((err as InputError).message).toMatch(pattern);
}

function draft(overrides: Partial<SpentRequestDraft> = {}): SpentRequestDraft {
  return {
    id: 'aaaaaaaaaaaaaaaa',
    digest,
    publicKey: pub,
    signedAt: '2026-11-21T08:00:00.000Z',
    ...overrides,
  };
}

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'airgap-spent-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('encodeSpentRequest / decodeSpentRequest', () => {
  it('round-trips as one JSON line', () => {
    const line = encodeSpentRequest(draft());
    expect(line.includes('\n')).toBe(false);
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      type: SPENT_REQUEST_TYPE,
      version: 1,
      id: 'aaaaaaaaaaaaaaaa',
      digest,
      publicKey: pub,
      signedAt: '2026-11-21T08:00:00.000Z',
    });
    expect(parsed.checksum.hex).toHaveLength(16);
    expect(decodeSpentRequest(line)).toEqual(parsed);
  });

  it('catches a checksum edit and unknown fields', () => {
    const line = encodeSpentRequest(draft());
    const doc = JSON.parse(line) as { digest: string; checksum: { hex: string }; extra?: number };
    doc.digest = '00'.repeat(32);
    expectCode(() => decodeSpentRequest(JSON.stringify(doc)), 'mismatch', /checksum/);
    doc.digest = digest;
    doc.checksum.hex = computeSpentChecksumHex({
      version: 1,
      type: SPENT_REQUEST_TYPE,
      id: 'aaaaaaaaaaaaaaaa',
      digest,
      publicKey: pub,
      signedAt: '2026-11-21T08:00:00.000Z',
    });
    doc.extra = 1;
    expectCode(() => decodeSpentRequest(JSON.stringify(doc)), 'invalid-type', /unexpected spent-request field/);
    expectCode(() => encodeSpentRequest(draft({ id: 'xyz' })), 'invalid-hex');
  });
});

describe('append-only spent-request log', () => {
  it('creates a file, appends two ids, and looks them up', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'spent.jsonl');
      const first = await appendSpentRequest(path, draft());
      const second = await appendSpentRequest(
        path,
        draft({ id: 'bbbbbbbbbbbbbbbb', signedAt: '2026-11-21T08:01:00.000Z' })
      );
      expect(first.id).toBe('aaaaaaaaaaaaaaaa');
      expect(second.id).toBe('bbbbbbbbbbbbbbbb');
      const lines = readFileSync(path, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(2);
      const loaded = await readSpentLog(path);
      expect(loaded.map((r) => r.id)).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
      expect(findSpentRequest(loaded, 'bbbbbbbbbbbbbbbb')?.digest).toBe(digest);
    });
  });

  it('treats a missing file as empty and still appends', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'missing.jsonl');
      expect(await readSpentLog(path)).toEqual([]);
      await appendSpentRequest(path, draft());
      expect(await readSpentLog(path)).toHaveLength(1);
    });
  });

  it('refuses a second signature for the same request id', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'spent.jsonl');
      await appendSpentRequest(path, draft());
      await expectAsyncCode(appendSpentRequest(path, draft({ digest: 'cd'.repeat(32) })), 'duplicate', /already signed/);
      expect(readFileSync(path, 'utf8').trim().split('\n')).toHaveLength(1);
    });
  });

  it('refuses to read a file whose earlier line was edited', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'torn.jsonl');
      await appendSpentRequest(path, draft());
      await appendSpentRequest(path, draft({ id: 'bbbbbbbbbbbbbbbb' }));
      const [line1, line2] = readFileSync(path, 'utf8').trim().split('\n');
      const tampered = JSON.parse(line1) as { digest: string };
      tampered.digest = '00'.repeat(32);
      writeFileSync(path, `${JSON.stringify(tampered)}\n${line2}\n`);
      await expectAsyncCode(readSpentLog(path), 'mismatch', /checksum/);
    });
  });
});

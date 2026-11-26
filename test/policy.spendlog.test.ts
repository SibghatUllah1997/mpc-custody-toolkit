import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  appendSpendEvent,
  decodeSpendEvent,
  encodeSpendEvent,
  evaluateSpendLimits,
  readSpendLog,
  spendActivityFromLog,
  SPEND_EVENT_TYPE,
  type Policy,
  type SpendLogDraft,
} from '../src/policy';
import { InputError } from '../src/errors';

const policy: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '80', windowSeconds: 3600, maxWindowValue: '100' }],
};

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

function draft(overrides: Partial<SpendLogDraft> = {}): SpendLogDraft {
  return { asset: 'ETH', value: '40', at: '2026-11-26T08:00:00.000Z', ...overrides };
}

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-spendlog-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('encodeSpendEvent / decodeSpendEvent', () => {
  it('round-trips as one JSON line', () => {
    const line = encodeSpendEvent(draft());
    expect(line.includes('\n')).toBe(false);
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      type: SPEND_EVENT_TYPE,
      version: 1,
      asset: 'ETH',
      value: '40',
      at: '2026-11-26T08:00:00.000Z',
    });
    expect(parsed.checksum.hex).toHaveLength(16);
    expect(decodeSpendEvent(line)).toEqual(parsed);
  });

  it('catches a checksum edit and unknown fields', () => {
    const parsed = JSON.parse(encodeSpendEvent(draft()));
    parsed.value = '99';
    expectCode(() => decodeSpendEvent(JSON.stringify(parsed)), 'mismatch', /checksum mismatch/);
    parsed.value = '40';
    parsed.extra = true;
    expectCode(() => decodeSpendEvent(JSON.stringify(parsed)), 'invalid-type', /unexpected spend-event field/);
  });
});

describe('readSpendLog / appendSpendEvent', () => {
  it('appends lines and feeds evaluateSpendLimits', async () => {
    await withDir(async (dir) => {
      const file = join(dir, 'spends.jsonl');
      await appendSpendEvent(file, draft({ value: '70' }));
      await appendSpendEvent(file, draft({ value: '20', at: '2026-11-26T08:10:00.000Z' }));
      const records = await readSpendLog(file);
      expect(records).toHaveLength(2);
      expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
      const now = new Date('2026-11-26T08:20:00.000Z');
      const spend = spendActivityFromLog(records, now);
      expect(evaluateSpendLimits(policy, { asset: 'ETH', value: '5' }, spend).allowed).toBe(true);
      expect(evaluateSpendLimits(policy, { asset: 'ETH', value: '15' }, spend).reasons[0].code).toBe(
        'window-exceeded'
      );
    });
  });

  it('treats a missing file as an empty log', async () => {
    await withDir(async (dir) => {
      const file = join(dir, 'missing.jsonl');
      expect(await readSpendLog(file)).toEqual([]);
    });
  });

  it('refuses a directory in place of the log', async () => {
    await withDir(async (dir) => {
      await expect(appendSpendEvent(dir, draft())).rejects.toMatchObject({ code: 'invalid-type' });
    });
  });
});

describe('spend log checksum on disk', () => {
  it('refuses a hand-edited line', async () => {
    await withDir(async (dir) => {
      const file = join(dir, 'spends.jsonl');
      await appendSpendEvent(file, draft());
      const line = JSON.parse(readFileSync(file, 'utf8'));
      line.value = '1';
      writeFileSync(file, JSON.stringify(line) + '\n');
      await expect(readSpendLog(file)).rejects.toMatchObject({ code: 'mismatch' });
    });
  });
});

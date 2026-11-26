import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  parseArgs,
  parseSpendCheckArgs,
  parseSpendRecordArgs,
  runSpendCheck,
  runSpendRecord,
} from '../src/cli';
import { InputError } from '../src/errors';
import { explainError } from '../src/ux/errors';
import type { Policy } from '../src/policy';

const policy: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '80', windowSeconds: 3600, maxWindowValue: '100' }],
};

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

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-cli-spend-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('spend-record / spend-check CLI flags', () => {
  it('parses record and check flags', () => {
    expect(
      parseSpendRecordArgs(
        parseArgs(['spend-record', '--file', 'spends.jsonl', '--asset', 'ETH', '--value', '40', '--at', '2026-11-26T08:00:00.000Z'])
      )
    ).toEqual({
      file: 'spends.jsonl',
      asset: 'ETH',
      value: '40',
      at: '2026-11-26T08:00:00.000Z',
    });
    expect(
      parseSpendCheckArgs(
        parseArgs(['spend-check', '--policy', 'p.json', '--asset', 'ETH', '--value', '10', '--file', 'spends.jsonl', '--to', 'bb22'])
      )
    ).toEqual({
      policy: 'p.json',
      asset: 'ETH',
      value: '10',
      file: 'spends.jsonl',
      to: 'bb22',
    });
  });

  it('rejects missing flags', () => {
    expectCode(
      () => parseSpendRecordArgs(parseArgs(['spend-record', '--asset', 'ETH', '--value', '1'])),
      'missing-value',
      /requires --file/
    );
    expectCode(
      () => parseSpendCheckArgs(parseArgs(['spend-check', '--asset', 'ETH', '--value', '1'])),
      'missing-value',
      /requires --policy/
    );
    expect(explainError(new Error('spend-record requires --file <path>')).hint).toMatch(/spends.jsonl/);
  });
});

describe('spend-record / spend-check file roundtrip', () => {
  it('records spends then denies a transfer that would exceed the window', async () => {
    await withDir(async (dir) => {
      const log = join(dir, 'spends.jsonl');
      const policyFile = join(dir, 'policy.json');
      writeFileSync(policyFile, JSON.stringify(policy));
      const now = new Date('2026-11-26T08:20:00.000Z');
      await runSpendRecord(
        { file: log, asset: 'ETH', value: '70', at: '2026-11-26T08:00:00.000Z' },
        { now }
      );
      const ok = await runSpendCheck(
        { policy: policyFile, asset: 'ETH', value: '20', file: log },
        { now }
      );
      expect(ok.allowed).toBe(true);
      expect(ok.history).toBe(1);
      const over = await runSpendCheck(
        { policy: policyFile, asset: 'ETH', value: '40', file: log },
        { now }
      );
      expect(over.allowed).toBe(false);
      expect(over.reasons[0].code).toBe('window-exceeded');
    });
  });
});

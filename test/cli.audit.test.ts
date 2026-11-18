import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  parseArgs,
  parseAuditAppendArgs,
  parseAuditReadArgs,
  runAuditAppend,
  runAuditRead,
} from '../src/cli';
import { InputError } from '../src/errors';
import { explainError } from '../src/ux/errors';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-cli-audit-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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

describe('audit-append / audit-read CLI flags', () => {
  it('parses a deny with codes and approvals', () => {
    const parsed = parseAuditAppendArgs(
      parseArgs([
        'audit-append',
        '--file',
        'decisions.jsonl',
        '--kind',
        'policy-decision',
        '--outcome',
        'deny',
        '--policy',
        'vault-main',
        '--asset',
        'ETH',
        '--value',
        '101',
        '--to',
        'bb22',
        '--approvals',
        'alice,bob',
        '--codes',
        'limit-exceeded',
      ])
    );
    expect(parsed).toMatchObject({
      file: 'decisions.jsonl',
      kind: 'policy-decision',
      outcome: 'deny',
      policyId: 'vault-main',
      asset: 'ETH',
      value: '101',
      to: 'bb22',
      approvals: ['alice', 'bob'],
      codes: ['limit-exceeded'],
    });
  });

  it('rejects a deny without codes and an unknown kind', () => {
    expectCode(
      () =>
        parseAuditAppendArgs(
          parseArgs(['audit-append', '--file', 'x.jsonl', '--kind', 'policy-decision', '--outcome', 'deny'])
        ),
      'missing-value',
      /requires --codes/
    );
    expectCode(
      () =>
        parseAuditAppendArgs(
          parseArgs(['audit-append', '--file', 'x.jsonl', '--kind', 'other', '--outcome', 'allow'])
        ),
      'invalid-type',
      /policy-decision or pre-sign/
    );
    expectCode(
      () => parseAuditReadArgs(parseArgs(['audit-read'])),
      'missing-value',
      /requires --file/
    );
    expect(explainError(new Error('audit-append --outcome deny requires --codes')).hint).toMatch(/--codes/);
  });
});

describe('audit-append / audit-read file roundtrip', () => {
  it('appends then reads the same events back', async () => {
    await withDir(async (dir) => {
      const file = join(dir, 'decisions.jsonl');
      const first = await runAuditAppend(
        parseAuditAppendArgs(
          parseArgs([
            'audit-append',
            '--file',
            file,
            '--kind',
            'policy-decision',
            '--outcome',
            'allow',
            '--policy',
            'vault-main',
            '--approvals',
            'alice,bob',
          ])
        )
      );
      await runAuditAppend(
        parseAuditAppendArgs(
          parseArgs([
            'audit-append',
            '--file',
            file,
            '--kind',
            'pre-sign',
            '--outcome',
            'deny',
            '--codes',
            'insufficient-approvals',
          ])
        )
      );
      const out = await runAuditRead(parseAuditReadArgs(parseArgs(['audit-read', '--file', file])).file);
      expect(out.count).toBe(2);
      expect(out.events[0].id).toBe(first.id);
      expect(out.events[1].kind).toBe('pre-sign');
      expect(out.events[1].codes).toEqual(['insufficient-approvals']);
    });
  });
});

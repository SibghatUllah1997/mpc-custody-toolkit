import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { appendAuditEvent } from '../src/audit';
import { parseArgs, parseDoctorArgs, runDoctorCommand } from '../src/cli';
import { encodeShare, newShareSetId } from '../src/encoding/share';
import { generatePrivateKey } from '../src/crypto/secp256k1';
import { InputError } from '../src/errors';
import { splitSecret } from '../src/sss/shamir';
import { explainError } from '../src/ux/errors';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-cli-doctor-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('doctor CLI flags', () => {
  it('parses share, audit, spent-log, and queue paths', () => {
    const parsed = parseDoctorArgs(
      parseArgs([
        'doctor',
        '--shares',
        'a.json,b.json',
        '--audit',
        'decisions.jsonl',
        '--spent-log',
        'spent.jsonl',
        '--queue',
        'queue.json',
      ])
    );
    expect(parsed.shares).toEqual(['a.json', 'b.json']);
    expect(parsed.audit).toBe('decisions.jsonl');
    expect(parsed.spent).toBe('spent.jsonl');
    expect(parsed.queue).toBe('queue.json');
  });

  it('rejects no targets and a bare --shares flag', () => {
    expect(() => parseDoctorArgs(parseArgs(['doctor', '--shares']))).toThrow(InputError);
    expect(explainError(new Error('doctor needs --shares, --audit, --spent-log, or --queue')).hint).toMatch(
      /files to inspect/
    );
  });
});

describe('doctor CLI roundtrip', () => {
  it('reports ok for valid share backups and an audit log', async () => {
    await withDir(async (dir) => {
      const shares = splitSecret(generatePrivateKey(), 2, 3);
      const set = { id: newShareSetId(), threshold: 2, total: 3 };
      const paths = shares.slice(0, 2).map((s, i) => {
        const path = join(dir, `s${i}.json`);
        writeFileSync(path, encodeShare(s, set));
        return path;
      });
      const audit = join(dir, 'decisions.jsonl');
      await appendAuditEvent(audit, { kind: 'policy-decision', outcome: 'allow', codes: [] });
      const report = await runDoctorCommand(
        parseDoctorArgs(parseArgs(['doctor', '--shares', paths.join(','), '--audit', audit]))
      );
      expect(report.ok).toBe(true);
      expect(report.checks.some((c) => c.kind === 'audit' && c.events === 1)).toBe(true);
    });
  });

  it('returns ok false when a named file is missing', async () => {
    await withDir(async (dir) => {
      const report = await runDoctorCommand(
        parseDoctorArgs(parseArgs(['doctor', '--spent-log', join(dir, 'gone.jsonl')]))
      );
      expect(report.ok).toBe(false);
      expect(report.checks[0].codes).toEqual(['missing-file']);
    });
  });
});

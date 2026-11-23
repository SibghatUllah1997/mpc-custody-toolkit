import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { appendAuditEvent } from '../src/audit';
import { checkAuditLog, checkShareFile, checkShareFiles, runDoctor } from '../src/doctor';
import { encodeShare, newShareSetId } from '../src/encoding/share';
import { generatePrivateKey } from '../src/crypto/secp256k1';
import { splitSecret } from '../src/sss/shamir';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-doctor-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('checkShareFile / checkShareFiles', () => {
  it('accepts tagged backups from one split and does not print the secret', async () => {
    await withDir(async (dir) => {
      const shares = splitSecret(generatePrivateKey(), 2, 3);
      const set = { id: newShareSetId(), threshold: 2, total: 3 };
      const paths = shares.slice(0, 2).map((s, i) => {
        const path = join(dir, `s${i}.json`);
        writeFileSync(path, encodeShare(s, set));
        return path;
      });
      const one = await checkShareFile(paths[0]);
      expect(one).toMatchObject({ ok: true, kind: 'share', x: shares[0].x, setId: set.id, encrypted: false });
      expect(JSON.stringify(one)).not.toMatch(/"y"/);
      const checks = await checkShareFiles(paths);
      expect(checks.every((c) => c.ok)).toBe(true);
      const summary = checks[checks.length - 1];
      expect(summary.shareCount).toBe(2);
      expect(summary.setId).toBe(set.id);
      expect(summary.threshold).toBe(2);
      expect(summary.detail).toMatch(set.id);
    });
  });

  it('flags a missing file, junk JSON, an encrypted envelope, and mixed sets', async () => {
    await withDir(async (dir) => {
      expect((await checkShareFile(join(dir, 'gone.json'))).codes).toEqual(['missing-file']);
      const junk = join(dir, 'junk.json');
      writeFileSync(junk, '{not-json');
      expect((await checkShareFile(junk)).codes).toEqual(['invalid-backup']);

      const envelope = join(dir, 'enc.json');
      writeFileSync(envelope, JSON.stringify({ version: 2, type: 'encrypted' }));
      expect((await checkShareFile(envelope)).codes).toEqual(['needs-password']);
      expect((await checkShareFile(envelope, 'wrong-password')).codes).toEqual(['decrypt-failed']);

      const a = splitSecret(generatePrivateKey(), 2, 2);
      const b = splitSecret(generatePrivateKey(), 2, 2);
      const p1 = join(dir, 'a.json');
      const p2 = join(dir, 'b.json');
      writeFileSync(p1, encodeShare(a[0], { id: newShareSetId(), threshold: 2, total: 2 }));
      writeFileSync(p2, encodeShare(b[1], { id: newShareSetId(), threshold: 2, total: 2 }));
      const mixed = await checkShareFiles([p1, p2]);
      expect(mixed.some((c) => c.codes.includes('incompatible-set'))).toBe(true);

      writeFileSync(join(dir, 'dup.json'), encodeShare(a[0], { id: newShareSetId(), threshold: 2, total: 2 }));
      const dups = await checkShareFiles([p1, join(dir, 'dup.json')]);
      expect(dups.some((c) => c.codes.includes('duplicate'))).toBe(true);
    });
  });

  it('rejects an empty share list', async () => {
    await expect(checkShareFiles([])).rejects.toMatchObject({ code: 'too-few' });
  });
});

describe('checkAuditLog', () => {
  it('accepts a chained log and an empty file, and flags a break', async () => {
    await withDir(async (dir) => {
      const missing = await checkAuditLog(join(dir, 'gone.jsonl'));
      expect(missing.ok).toBe(false);
      expect(missing.codes).toEqual(['missing-file']);

      const empty = join(dir, 'empty.jsonl');
      writeFileSync(empty, '');
      const emptyCheck = await checkAuditLog(empty);
      expect(emptyCheck).toMatchObject({ ok: true, events: 0 });

      const file = join(dir, 'ok.jsonl');
      await appendAuditEvent(file, { kind: 'policy-decision', outcome: 'allow', codes: [] });
      await appendAuditEvent(file, { kind: 'pre-sign', outcome: 'deny', codes: ['limit-exceeded'] });
      const ok = await checkAuditLog(file);
      expect(ok).toMatchObject({ ok: true, events: 2, kind: 'audit' });
      expect(ok.detail).toMatch(/chain intact/);

      const broken = join(dir, 'broken.jsonl');
      writeFileSync(broken, '{"version":1,"type":"audit-event"}\n');
      expect((await checkAuditLog(broken)).codes).toEqual(['invalid-audit']);
    });
  });
});

describe('runDoctor', () => {
  it('combines share and audit checks and fails closed when any check fails', async () => {
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

      const report = await runDoctor({ shares: paths, audit });
      expect(report.ok).toBe(true);
      expect(report.checks.some((c) => c.kind === 'share' && c.shareCount === 2)).toBe(true);
      expect(report.checks.some((c) => c.kind === 'audit' && c.events === 1)).toBe(true);

      const bad = await runDoctor({ shares: paths, audit: join(dir, 'missing.jsonl') });
      expect(bad.ok).toBe(false);
      expect(bad.checks.some((c) => c.codes.includes('missing-file'))).toBe(true);
    });
  });

  it('rejects missing targets', async () => {
    await expect(runDoctor({})).rejects.toMatchObject({ code: 'missing-value' });
    await expect(runDoctor(null as never)).rejects.toMatchObject({ code: 'invalid-type' });
  });
});

describe('checkAuditLog directory target', () => {
  it('refuses a path that is not a regular file', async () => {
    await withDir(async (dir) => {
      const nested = join(dir, 'nested');
      mkdirSync(nested);
      expect((await checkAuditLog(nested)).codes).toEqual(['not-a-file']);
    });
  });
});

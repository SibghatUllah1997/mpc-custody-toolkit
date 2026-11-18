import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  appendAuditEvent,
  lastAuditEvent,
  readAuditLog,
  type AuditDraft,
} from '../src/audit';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-audit-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function allowDraft(overrides: Partial<AuditDraft> = {}): AuditDraft {
  return {
    kind: 'policy-decision',
    outcome: 'allow',
    codes: [],
    policyId: 'vault-main',
    asset: 'ETH',
    value: '50',
    approvals: ['alice', 'bob'],
    ...overrides,
  };
}

describe('append-only audit log files', () => {
  it('creates a file, appends two events, and keeps both lines', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'decisions.jsonl');
      const first = await appendAuditEvent(path, allowDraft({ id: 'aaaaaaaaaaaaaaaa', ts: '2026-11-18T00:00:00.000Z' }));
      const second = await appendAuditEvent(
        path,
        allowDraft({
          kind: 'pre-sign',
          outcome: 'deny',
          codes: ['insufficient-approvals'],
          approvals: ['alice'],
          id: 'bbbbbbbbbbbbbbbb',
          ts: '2026-11-18T00:00:01.000Z',
        })
      );
      expect(first.seq).toBe(1);
      expect(second.seq).toBe(2);
      expect(second.prev).not.toBe(first.prev);
      const lines = readFileSync(path, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(2);
      const loaded = await readAuditLog(path);
      expect(loaded.map((e) => e.id)).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
      expect((await lastAuditEvent(path))?.id).toBe('bbbbbbbbbbbbbbbb');
    });
  });

  it('treats a missing file as an empty log and still appends', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'missing.jsonl');
      expect(await readAuditLog(path)).toEqual([]);
      expect(await lastAuditEvent(path)).toBeUndefined();
      await appendAuditEvent(path, allowDraft());
      expect(await readAuditLog(path)).toHaveLength(1);
    });
  });

  it('refuses to extend a file whose earlier line was edited', async () => {
    await withDir(async (dir) => {
      const path = join(dir, 'torn.jsonl');
      await appendAuditEvent(path, allowDraft({ id: 'aaaaaaaaaaaaaaaa' }));
      await appendAuditEvent(path, allowDraft({ id: 'bbbbbbbbbbbbbbbb', kind: 'pre-sign' }));
      const [line1, line2] = readFileSync(path, 'utf8').trim().split('\n');
      const tampered = JSON.parse(line1) as { outcome: string };
      tampered.outcome = 'deny';
      writeFileSync(path, `${JSON.stringify(tampered)}\n${line2}\n`);
      await expect(readAuditLog(path)).rejects.toThrow(/checksum mismatch|chain break/);
      await expect(appendAuditEvent(path, allowDraft())).rejects.toThrow(/checksum mismatch|chain break/);
      const still = readFileSync(path, 'utf8').trim().split('\n');
      expect(still).toHaveLength(2);
    });
  });

  it('rejects an empty path and a non-object draft', async () => {
    await expect(readAuditLog('')).rejects.toThrow(/path is required/);
    await expect(appendAuditEvent('', allowDraft())).rejects.toThrow(/path is required/);
    await withDir(async (dir) => {
      await expect(appendAuditEvent(join(dir, 'x.jsonl'), undefined as never)).rejects.toThrow(/draft must be an object/);
    });
  });
});

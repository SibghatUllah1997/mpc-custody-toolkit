import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Examples } from '../src';
import { SAMPLE_POLICY, SAMPLE_TX } from '../src/examples/custody-workflow';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-flow-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('sample custody workflow', () => {
  it('backs up shares, passes pre-sign, and produces a verifiable signature', async () => {
    await withDir(async (dir) => {
      const backupPath = join(dir, 'vault.ndjson');
      const result = await Examples.runCustodyWorkflow({ backupPath });
      expect(result.preSignOk).toBe(true);
      expect(result.verified).toBe(true);
      expect(result.usedShareXs).toHaveLength(2);
      expect(result.signature).toMatch(/^[0-9a-f]{128}$/);
      expect(result.set.threshold).toBe(2);
      expect(result.set.total).toBe(3);

      const snapshot = JSON.parse(result.policyJson);
      expect(snapshot.version).toBe(2);
      expect(snapshot.policies[0].id).toBe(SAMPLE_POLICY.id);
      expect(readFileSync(backupPath, 'utf8').trim().split('\n')).toHaveLength(3);
    });
  });

  it('stops when the transfer is above the spend cap', async () => {
    await withDir(async (dir) => {
      await expect(
        Examples.runCustodyWorkflow({
          backupPath: join(dir, 'vault.ndjson'),
          tx: { ...SAMPLE_TX, value: '500' },
        })
      ).rejects.toThrow(/exceed/i);
    });
  });

  it('stops when the destination is not on the allow list', async () => {
    await withDir(async (dir) => {
      await expect(
        Examples.runCustodyWorkflow({
          backupPath: join(dir, 'vault.ndjson'),
          tx: { ...SAMPLE_TX, to: 'cc33' },
        })
      ).rejects.toThrow(/not allowed/i);
    });
  });
});

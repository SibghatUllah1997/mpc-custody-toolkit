import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  parseArgs,
  parsePolicyExportArgs,
  parsePolicyVerifyArgs,
  runPolicyExport,
  runPolicyVerify,
} from '../src/cli';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { InputError } from '../src/errors';
import { decodePolicySnapshot, type Policy } from '../src/policy';
import { explainError } from '../src/ux/errors';
import { bytesToHex } from '../src/utils/bytes';

const policy: Policy = {
  id: 'vault-main',
  name: 'Main vault',
  signers: [{ id: 'alice' }, { id: 'bob' }],
  threshold: 2,
  limits: [{ asset: 'ETH', maxValue: '100', allowTo: ['bb22'] }],
};

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-cli-policy-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('policy-export / policy-verify CLI', () => {
  it('parses flags and rejects a key on argv', () => {
    const parsed = parsePolicyExportArgs(
      parseArgs(['policy-export', '--policy', 'p.json', '--key-file', 'k', '--out', 's.json', '--ttl', '1h'])
    );
    expect(parsed).toMatchObject({ policy: 'p.json', keyFile: 'k', out: 's.json', ttl: '1h' });
    expect(() =>
      parsePolicyExportArgs(
        parseArgs(['policy-export', '--policy', 'p.json', '--key', 'aa', '--out', 's.json'])
      )
    ).toThrow(/not accepted on the command line/);
    expect(() => parsePolicyVerifyArgs(parseArgs(['policy-verify', '--pubkey', 'aa']))).toThrow(
      /requires --snapshot/
    );
    expect(explainError(new Error('policy-export requires --policy <file>')).hint).toMatch(/JSON file/);
  });

  it('exports a snapshot, verifies it, and refuses a later deadline', async () => {
    await withDir(async (dir) => {
      const keys = generateKeyPair();
      const policyFile = join(dir, 'policy.json');
      const keyFile = join(dir, 'policy.key');
      const out = join(dir, 'snap.json');
      writeFileSync(policyFile, JSON.stringify(policy));
      writeFileSync(keyFile, bytesToHex(keys.privateKey) + '\n');
      const now = new Date('2026-11-24T08:00:00.000Z');
      const snap = await runPolicyExport(
        parsePolicyExportArgs(
          parseArgs(['policy-export', '--policy', policyFile, '--key-file', keyFile, '--out', out, '--ttl', '1h'])
        ),
        { now }
      );
      expect(snap.expiresAt).toBe('2026-11-24T09:00:00.000Z');
      expect(readFileSync(out, 'utf8')).toContain(snap.digest);
      const ok = await runPolicyVerify(
        parsePolicyVerifyArgs(
          parseArgs(['policy-verify', '--snapshot', out, '--pubkey', bytesToHex(keys.publicKey)])
        ),
        { now }
      );
      expect(ok).toMatchObject({ ok: true, policyId: 'vault-main', publicKey: bytesToHex(keys.publicKey) });
      await expect(
        runPolicyVerify(
          { snapshot: out, pubkey: bytesToHex(keys.publicKey) },
          { now: new Date('2026-11-24T09:00:00.000Z') }
        )
      ).rejects.toMatchObject({ code: 'expired' });
      const loaded = decodePolicySnapshot(readFileSync(out, 'utf8'), { now });
      expect(loaded.policy.limits[0].maxValue).toBe('100');
    });
  });

  it('never overwrites an existing snapshot file', async () => {
    await withDir(async (dir) => {
      const keys = generateKeyPair();
      const policyFile = join(dir, 'policy.json');
      const keyFile = join(dir, 'policy.key');
      const out = join(dir, 'snap.json');
      writeFileSync(policyFile, JSON.stringify(policy));
      writeFileSync(keyFile, bytesToHex(keys.privateKey) + '\n');
      writeFileSync(out, 'already\n');
      await expect(
        runPolicyExport({ policy: policyFile, keyFile, out }, { now: new Date('2026-11-24T08:00:00.000Z') })
      ).rejects.toThrow(/EEXIST/);
    });
  });

  it('rejects invalid policy JSON', async () => {
    await withDir(async (dir) => {
      const keys = generateKeyPair();
      const policyFile = join(dir, 'policy.json');
      const keyFile = join(dir, 'policy.key');
      writeFileSync(policyFile, '{not-json');
      writeFileSync(keyFile, bytesToHex(keys.privateKey) + '\n');
      await expect(
        runPolicyExport({ policy: policyFile, keyFile, out: join(dir, 'snap.json') })
      ).rejects.toBeInstanceOf(InputError);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFileSync } from 'fs';
import {
  parseArgs,
  parseQueueCreateArgs,
  parseQueueReceiptArgs,
  parseQueueStatusArgs,
  runQueueCreate,
  runQueueReceipt,
  runQueueStatus,
} from '../src/cli';
import { generateKeyPair } from '../src/crypto/secp256k1';
import { InputError } from '../src/errors';
import { decodeApprovalQueue } from '../src/queue';
import { explainError } from '../src/ux/errors';
import { bytesToHex } from '../src/utils/bytes';

async function withDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'mpc-cli-queue-'));
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

describe('queue CLI flags', () => {
  it('parses approver pairs and rejects a missing threshold or a key on argv', () => {
    const parsed = parseQueueCreateArgs(
      parseArgs([
        'queue-create',
        '--file',
        'q.json',
        '--threshold',
        '2',
        '--approvers',
        'alice:02' + 'ab'.repeat(32) + ',bob:03' + 'cd'.repeat(32),
        '--digest',
        '11'.repeat(32),
      ])
    );
    expect(parsed.threshold).toBe(2);
    expect(parsed.approvers).toHaveLength(2);
    expect(parsed.approvers[0].id).toBe('alice');
    expectCode(
      () => parseQueueCreateArgs(parseArgs(['queue-create', '--file', 'q.json', '--approvers', 'alice:aa'])),
      'missing-value',
      /requires --threshold/
    );
    expectCode(
      () =>
        parseQueueReceiptArgs(
          parseArgs(['queue-receipt', '--file', 'q.json', '--signer', 'alice', '--key', 'aa'])
        ),
      'invalid-type',
      /not accepted on the command line/
    );
    expectCode(
      () => parseQueueStatusArgs(parseArgs(['queue-status'])),
      'missing-value',
      /requires --file/
    );
    expect(explainError(new Error('queue-create requires --approvers id:pubkey,...')).hint).toMatch(/alice:/);
    expectCode(
      () =>
        parseQueueCreateArgs(
          parseArgs([
            'queue-create',
            '--file',
            'q.json',
            '--threshold',
            '1',
            '--approvers',
            'alice:02' + 'ab'.repeat(32),
            '--digest',
            '11'.repeat(32),
            '--ttl',
            '1h',
            '--expires',
            '2026-11-22T08:00:00Z',
          ])
        ),
      'invalid-type',
      /only one of --ttl or --expires/
    );
    expect(explainError(new Error('cannot add a receipt: approval item expiresAt 2026-11-22T08:00:00.000Z has passed')).hint).toMatch(
      /new queue item/
    );
    expect(
      explainError(
        new Error('waiting until 2026-11-24T08:15:00.000Z (600s after readyAt 2026-11-24T08:05:00.000Z)')
      ).hint
    ).toMatch(/delayUntil/);
  });
});

describe('queue CLI file roundtrip', () => {
  it('creates an item, collects two receipts, and reports ready', async () => {
    await withDir(async (dir) => {
      const alice = generateKeyPair();
      const bob = generateKeyPair();
      const file = join(dir, 'queue.json');
      const aliceKey = join(dir, 'alice.key');
      const bobKey = join(dir, 'bob.key');
      writeFileSync(aliceKey, bytesToHex(alice.privateKey) + '\n');
      writeFileSync(bobKey, bytesToHex(bob.privateKey) + '\n');

      const item = await runQueueCreate(
        parseQueueCreateArgs(
          parseArgs([
            'queue-create',
            '--file',
            file,
            '--threshold',
            '2',
            '--approvers',
            `alice:${bytesToHex(alice.publicKey)},bob:${bytesToHex(bob.publicKey)}`,
            '--from',
            'aa11',
            '--to',
            'bb22',
            '--value',
            '40',
            '--id',
            'aaaaaaaaaaaaaaaa',
          ])
        )
      );
      expect(item.data.threshold).toBe(2);
      expect((await runQueueStatus({ file })).items[0].ready).toBe(false);

      await runQueueReceipt(
        parseQueueReceiptArgs(
          parseArgs(['queue-receipt', '--file', file, '--signer', 'alice', '--key-file', aliceKey])
        )
      );
      const afterBob = await runQueueReceipt(
        parseQueueReceiptArgs(
          parseArgs(['queue-receipt', '--file', file, '--signer', 'bob', '--key-file', bobKey])
        )
      );
      expect(afterBob.data.receipts).toHaveLength(2);
      const status = await runQueueStatus(parseQueueStatusArgs(parseArgs(['queue-status', '--file', file])));
      expect(status.count).toBe(1);
      expect(status.items[0]).toMatchObject({ ready: true, receiptCount: 2, needed: 0 });
      expect(status.items[0].signerIds).toEqual(['alice', 'bob']);
    });
  });

  it('refuses a duplicate item id', async () => {
    await withDir(async (dir) => {
      const alice = generateKeyPair();
      const file = join(dir, 'queue.json');
      const flags = [
        'queue-create',
        '--file',
        file,
        '--threshold',
        '1',
        '--approvers',
        `alice:${bytesToHex(alice.publicKey)}`,
        '--digest',
        '11'.repeat(32),
        '--id',
        'bbbbbbbbbbbbbbbb',
      ];
      await runQueueCreate(parseQueueCreateArgs(parseArgs(flags)));
      await expect(runQueueCreate(parseQueueCreateArgs(parseArgs(flags)))).rejects.toMatchObject({ code: 'duplicate' });
    });
  });

  it('stamps expiresAt from --ttl and drops receipts once that instant has passed', async () => {
    await withDir(async (dir) => {
      const alice = generateKeyPair();
      const file = join(dir, 'queue.json');
      const aliceKey = join(dir, 'alice.key');
      writeFileSync(aliceKey, bytesToHex(alice.privateKey) + '\n');
      const created = await runQueueCreate(
        parseQueueCreateArgs(
          parseArgs([
            'queue-create',
            '--file',
            file,
            '--threshold',
            '1',
            '--approvers',
            `alice:${bytesToHex(alice.publicKey)}`,
            '--digest',
            '11'.repeat(32),
            '--id',
            'cccccccccccccccc',
            '--ttl',
            '1h',
          ])
        ),
        { now: new Date('2026-11-22T07:00:00.000Z') }
      );
      expect(created.data.expiresAt).toBe('2026-11-22T08:00:00.000Z');

      await runQueueReceipt(
        parseQueueReceiptArgs(parseArgs(['queue-receipt', '--file', file, '--signer', 'alice', '--key-file', aliceKey])),
        { now: new Date('2026-11-22T07:30:00.000Z') }
      );
      const ready = await runQueueStatus({ file }, { now: new Date('2026-11-22T07:30:00.000Z') });
      expect(ready.items[0]).toMatchObject({ ready: true, receiptCount: 1, expired: false });

      const late = await runQueueStatus({ file }, { now: new Date('2026-11-22T08:00:00.000Z') });
      expect(late.items[0]).toMatchObject({ ready: false, receiptCount: 0, expired: true, needed: 1 });
      const stored = decodeApprovalQueue(readFileSync(file, 'utf8'));
      expect(stored.items[0].data.receipts).toEqual([]);

      await expect(
        runQueueReceipt(
          parseQueueReceiptArgs(parseArgs(['queue-receipt', '--file', file, '--signer', 'alice', '--key-file', aliceKey])),
          { now: new Date('2026-11-22T08:00:00.000Z') }
        )
      ).rejects.toThrow(/expiresAt .* has passed/);
    });
  });

  it('stamps delaySeconds from --delay and stays unready until that wait elapses', async () => {
    await withDir(async (dir) => {
      const alice = generateKeyPair();
      const file = join(dir, 'queue.json');
      const aliceKey = join(dir, 'alice.key');
      writeFileSync(aliceKey, bytesToHex(alice.privateKey) + '\n');
      const created = await runQueueCreate(
        parseQueueCreateArgs(
          parseArgs([
            'queue-create',
            '--file',
            file,
            '--threshold',
            '1',
            '--approvers',
            `alice:${bytesToHex(alice.publicKey)}`,
            '--digest',
            '11'.repeat(32),
            '--id',
            'dddddddddddddddd',
            '--delay',
            '15m',
          ])
        ),
        { now: new Date('2026-11-24T08:00:00.000Z') }
      );
      expect(created.data.delaySeconds).toBe(900);

      await runQueueReceipt(
        parseQueueReceiptArgs(parseArgs(['queue-receipt', '--file', file, '--signer', 'alice', '--key-file', aliceKey])),
        { now: new Date('2026-11-24T08:00:00.000Z') }
      );
      const waiting = await runQueueStatus({ file }, { now: new Date('2026-11-24T08:10:00.000Z') });
      expect(waiting.items[0]).toMatchObject({
        ready: false,
        delayPending: true,
        receiptCount: 1,
        needed: 0,
        delayUntil: '2026-11-24T08:15:00.000Z',
      });
      const done = await runQueueStatus({ file }, { now: new Date('2026-11-24T08:15:00.000Z') });
      expect(done.items[0]).toMatchObject({ ready: true, delayPending: false });
    });
  });
});

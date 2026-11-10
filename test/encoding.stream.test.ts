import { describe, expect, it } from 'vitest';
import { PassThrough, Readable } from 'node:stream';
import { sha256 } from '@noble/hashes/sha256';
import { Secp256k1, Shamir } from '../src';
import {
  decodeShareRecord,
  encodeShareRecord,
  readShareBackupStream,
  writeShareBackupStream,
} from '../src/encoding/stream';
import { newShareSetId, type ShareSetInfo } from '../src/encoding/share';
import { bytesToHex } from '../src/utils/bytes';
import { stableStringify } from '../src/utils/json';
import type { Share } from '../src/sss/shamir';

function splitPair() {
  const secret = Secp256k1.generatePrivateKey();
  const shares = Shamir.splitSecret(secret, 2, 3);
  return { secret, shares };
}

function legacyV1Line(share: Share): string {
  const data = { x: share.x, y: bytesToHex(share.y) };
  const checksum = bytesToHex(sha256(new TextEncoder().encode(stableStringify(data)))).slice(0, 16);
  return JSON.stringify({
    version: 1,
    type: 'shamir-share',
    data,
    checksum: { algo: 'sha256', hex: checksum },
  });
}

async function roundtrip(items: Array<{ share: Share; set?: ShareSetInfo }>) {
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on('data', (c) => chunks.push(Buffer.from(c)));
  await writeShareBackupStream(sink, items);
  const ndjson = Buffer.concat(chunks).toString('utf8');
  const back = await readShareBackupStream(Readable.from([ndjson]));
  return { ndjson, back };
}

describe('share backup NDJSON codec', () => {
  it('encodes one compact line that still decodes as a share backup', () => {
    const { shares } = splitPair();
    const line = encodeShareRecord(shares[0]);
    expect(line.includes('\n')).toBe(false);
    expect(JSON.parse(line).version).toBe(2);
    const back = decodeShareRecord(`  ${line}  `);
    expect(back.share.x).toBe(shares[0].x);
    expect(bytesToHex(back.share.y)).toBe(bytesToHex(shares[0].y));
  });

  it('rejects an empty record', () => {
    expect(() => decodeShareRecord('   ')).toThrow(/empty share record/);
  });
});

describe('share backup streams', () => {
  it('roundtrips several shares, including split metadata', async () => {
    const { shares } = splitPair();
    const set: ShareSetInfo = { id: newShareSetId(), threshold: 2, total: 3 };
    const { ndjson, back } = await roundtrip([
      { share: shares[0], set },
      { share: shares[2], set },
    ]);
    expect(ndjson.trim().split('\n')).toHaveLength(2);
    expect(back.map((b) => b.share.x)).toEqual([shares[0].x, shares[2].x]);
    expect(back.every((b) => b.set?.id === set.id)).toBe(true);
    expect(bytesToHex(back[1].share.y)).toBe(bytesToHex(shares[2].y));
  });

  it('reassembles records split across small chunks', async () => {
    const { shares } = splitPair();
    const line = encodeShareRecord(shares[1]) + '\n';
    const pieces = line.match(/.{1,11}/g) ?? [];
    const back = await readShareBackupStream(Readable.from(pieces.map((p) => Buffer.from(p))));
    expect(back).toHaveLength(1);
    expect(bytesToHex(back[0].share.y)).toBe(bytesToHex(shares[1].y));
  });

  it('skips blank lines and upgrades a v1 record in the stream', async () => {
    const { shares } = splitPair();
    const ndjson = '\n' + legacyV1Line(shares[0]) + '\n\n';
    const back = await readShareBackupStream(Readable.from([ndjson]));
    expect(back).toHaveLength(1);
    expect(back[0].sourceVersion).toBe(1);
    expect(bytesToHex(back[0].share.y)).toBe(bytesToHex(shares[0].y));
  });

  it('fails closed on a malformed JSON line', async () => {
    await expect(readShareBackupStream(Readable.from(['{"not":"a-share"}\n']))).rejects.toThrow();
  });
});

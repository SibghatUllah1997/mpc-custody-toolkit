import { createReadStream, createWriteStream } from 'node:fs';
import { Readable, Transform, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { combineShares, type Share } from '../sss/shamir.js';
import { createNdjsonSplitter } from './ndjson.js';
import {
  assertCompatibleShareSet,
  decodeShareBackup,
  encodeShare,
  type DecodedShareBackup,
  type ShareSetInfo,
} from './share.js';

export { createNdjsonSplitter, DEFAULT_MAX_NDJSON_LINE_BYTES } from './ndjson.js';

/** One share plus optional split metadata, ready to encode as an NDJSON record. */
export type ShareExportItem = {
  share: Share;
  set?: ShareSetInfo;
};

/** Minify a share backup to a single NDJSON line (pretty JSON cannot be streamed as one record). */
export function encodeShareRecord(share: Share, set?: ShareSetInfo): string {
  return JSON.stringify(JSON.parse(encodeShare(share, set)));
}

export function decodeShareRecord(line: string): DecodedShareBackup {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    throw new Error('empty share record');
  }
  return decodeShareBackup(trimmed);
}

/** Object-mode writable: `ShareExportItem` in, NDJSON bytes out. */
export function createShareEncodeTransform(): Transform {
  return new Transform({
    writableObjectMode: true,
    transform(item: ShareExportItem, _encoding, callback) {
      try {
        if (!item || typeof item !== 'object' || item.share === undefined) {
          callback(new Error('share export item must include a share'));
          return;
        }
        this.push(encodeShareRecord(item.share, item.set) + '\n');
        callback();
      } catch (err) {
        callback(err as Error);
      }
    },
  });
}

/** Object-mode: NDJSON line strings in, `DecodedShareBackup` out. */
export function createShareDecodeTransform(): Transform {
  return new Transform({
    writableObjectMode: true,
    readableObjectMode: true,
    transform(line: string, _encoding, callback) {
      try {
        this.push(decodeShareRecord(String(line)));
        callback();
      } catch (err) {
        callback(err as Error);
      }
    },
  });
}

export async function writeShareBackupStream(
  out: Writable,
  items: Iterable<ShareExportItem>
): Promise<void> {
  const source = Readable.from(items, { objectMode: true });
  await pipeline(source, createShareEncodeTransform(), out);
}

export async function readShareBackupStream(input: Readable): Promise<DecodedShareBackup[]> {
  const backups: DecodedShareBackup[] = [];
  const decode = createShareDecodeTransform();
  decode.on('data', (backup: DecodedShareBackup) => {
    backups.push(backup);
  });
  await pipeline(input, createNdjsonSplitter(), decode);
  return backups;
}

export async function exportShareBackupNdjson(
  path: string,
  items: Iterable<ShareExportItem>
): Promise<void> {
  const out = createWriteStream(path, { encoding: 'utf8' });
  await writeShareBackupStream(out, items);
}

export async function importShareBackupNdjson(path: string): Promise<DecodedShareBackup[]> {
  return readShareBackupStream(createReadStream(path, { encoding: 'utf8' }));
}

/**
 * Turn decoded stream records into shares. Duplicate indexes fail, and tagged
 * records must all belong to the same split with at least `threshold` of them.
 */
export function sharesFromBackupStream(backups: DecodedShareBackup[]): Share[] {
  const originByX = new Map<number, number>();
  const shares: Share[] = [];
  for (let i = 0; i < backups.length; i++) {
    const s = backups[i].share;
    const prev = originByX.get(s.x);
    if (prev !== undefined) {
      throw new Error(`duplicate share x=${s.x} at records ${prev + 1} and ${i + 1}`);
    }
    originByX.set(s.x, i);
    shares.push({ x: s.x, y: s.y });
  }
  assertCompatibleShareSet(backups);
  return shares;
}

export async function combineFromShareBackupStream(input: Readable): Promise<Uint8Array> {
  const backups = await readShareBackupStream(input);
  if (backups.length < 2) {
    throw new Error('need at least 2 share records');
  }
  return combineShares(sharesFromBackupStream(backups));
}

export async function combineFromShareBackupNdjson(path: string): Promise<Uint8Array> {
  return combineFromShareBackupStream(createReadStream(path, { encoding: 'utf8' }));
}

import { Readable, Transform, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Share } from '../sss/shamir.js';
import { createNdjsonSplitter } from './ndjson.js';
import {
  decodeShareBackup,
  encodeShare,
  type DecodedShareBackup,
  type ShareSetInfo,
} from './share.js';

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

import { readFile } from 'fs/promises';
import { getPublicKeyCompressed } from '../crypto/secp256k1.js';
import { decryptToString, isEncryptedEnvelope } from '../encoding/encrypted.js';
import {
  assertCompatibleShareSet,
  decodeShareBackup,
  type DecodedShareBackup,
} from '../encoding/share.js';
import { importShareBackupNdjson } from '../encoding/stream.js';
import { InputError } from '../errors/input.js';
import { combineShares, MIN_THRESHOLD, type Share } from '../sss/shamir.js';
import { bytesToHex } from '../utils/bytes.js';
import type { RecoveryDryRunReport, RecoveryShareNote } from './types.js';

export type DryRunShareInput = {
  backup: DecodedShareBackup;
  encrypted?: boolean;
  path?: string;
};

function noteFrom(item: DryRunShareInput): RecoveryShareNote {
  const note: RecoveryShareNote = {
    x: item.backup.share.x,
    encrypted: item.encrypted === true,
    sourceVersion: item.backup.sourceVersion,
  };
  if (item.path !== undefined) note.path = item.path;
  return note;
}

/**
 * Validate share integrity and threshold, reconstruct the key in memory,
 * then return only public fields. The reconstructed scalar is wiped.
 */
export function dryRunRecovery(inputs: DryRunShareInput[]): RecoveryDryRunReport {
  if (!Array.isArray(inputs) || inputs.length < MIN_THRESHOLD) {
    throw new InputError('too-few', `need at least ${MIN_THRESHOLD} shares`, 'shares');
  }
  const originByX = new Map<number, string>();
  const shares: Share[] = [];
  const notes: RecoveryShareNote[] = [];
  for (const item of inputs) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || item.backup === undefined) {
      throw new InputError('invalid-type', 'dry-run item must include a decoded backup', 'shares');
    }
    const share = item.backup.share;
    const label = item.path ?? `x=${share.x}`;
    const prev = originByX.get(share.x);
    if (prev !== undefined) {
      throw new InputError('duplicate', `duplicate share x=${share.x} in ${prev} and ${label}`, 'shares');
    }
    originByX.set(share.x, label);
    shares.push({ x: share.x, y: share.y });
    notes.push(noteFrom(item));
  }
  const set = assertCompatibleShareSet(inputs.map((item) => item.backup));
  const secret = combineShares(shares);
  let publicKey: string;
  try {
    publicKey = bytesToHex(getPublicKeyCompressed(secret));
  } finally {
    secret.fill(0);
  }
  notes.sort((a, b) => a.x - b.x);
  const report: RecoveryDryRunReport = {
    ok: true,
    shareCount: notes.length,
    usedShareXs: notes.map((n) => n.x),
    threshold: set?.threshold ?? MIN_THRESHOLD,
    encryptedCount: notes.filter((n) => n.encrypted).length,
    publicKey,
    shares: notes,
  };
  if (set?.total !== undefined) report.total = set.total;
  if (set?.id !== undefined) report.setId = set.id;
  return report;
}

export async function dryRunRecoveryFromFiles(
  files: string[],
  opts?: { password?: string }
): Promise<RecoveryDryRunReport> {
  if (!Array.isArray(files) || files.length < MIN_THRESHOLD) {
    throw new InputError('too-few', `need at least ${MIN_THRESHOLD} files`, 'files');
  }
  const inputs: DryRunShareInput[] = [];
  for (const path of files) {
    if (typeof path !== 'string' || path.trim() === '') {
      throw new InputError('invalid-type', 'file path must be a non-empty string', 'files');
    }
    const raw = await readFile(path, { encoding: 'utf8' });
    const encrypted = isEncryptedEnvelope(raw);
    const json = encrypted ? await decryptToString(raw, opts?.password ?? '') : raw;
    inputs.push({ backup: decodeShareBackup(json), encrypted, path });
  }
  return dryRunRecovery(inputs);
}

export async function dryRunRecoveryFromNdjson(path: string): Promise<RecoveryDryRunReport> {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new InputError('missing-value', '--stream <file.ndjson> is required', 'stream');
  }
  const backups = await importShareBackupNdjson(path);
  return dryRunRecovery(backups.map((backup) => ({ backup, encrypted: false, path })));
}

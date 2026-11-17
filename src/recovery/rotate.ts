/**
 * Share rotation: rebuild the key from an old share set, split it again into
 * a fresh (k, n) set with a new set id, prove the new set rebuilds the same
 * public key, and only then retire the old backup files.
 *
 * The key itself does not change. Rotation is for when a share holder leaves,
 * a backup may have been exposed, or the policy moves from 2-of-3 to 3-of-5:
 * old shares from a different split cannot be combined with the new ones, so
 * an old share on its own becomes useless once enough old copies are retired.
 */
import { readdir, rename, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { getPublicKeyCompressed } from '../crypto/secp256k1.js';
import { encryptString } from '../encoding/encrypted.js';
import { encodeShare, newShareSetId, type ShareSetInfo } from '../encoding/share.js';
import { InputError } from '../errors/input.js';
import { combineShares, splitSecret, type Share } from '../sss/shamir.js';
import { bytesToHex, normalizeHex } from '../utils/bytes.js';
import { dryRunRecovery, loadShareInputs, type DryRunShareInput } from './dryrun.js';

export const RETIRED_SUFFIX = '.retired';

export type RotateOptions = {
  threshold: number;
  total: number;
  /** Compressed public key the old shares must rebuild; refuses otherwise. */
  expectedPublicKey?: string;
  /** Fixed set id for reproducible tests; a random one is used by default. */
  setId?: string;
};

export type RotatedShareSet = {
  publicKey: string;
  oldSetId?: string;
  set: ShareSetInfo;
  shares: Share[];
};

function checkPublicKey(actual: string, expected: string | undefined): void {
  if (expected === undefined) return;
  if (normalizeHex(expected) !== actual) {
    throw new InputError(
      'mismatch',
      'old shares rebuild a key that does not match the expected public key',
      'pubkey'
    );
  }
}

/**
 * Re-split the key behind `inputs` into a new set. Pure: no files are touched.
 * The rebuilt scalar is wiped before returning.
 */
export function rotateShareSet(inputs: DryRunShareInput[], opts: RotateOptions): RotatedShareSet {
  if (!opts || typeof opts !== 'object') {
    throw new InputError('invalid-type', 'rotation options must be an object', 'threshold');
  }
  // Validates integrity, duplicates, set compatibility, and threshold.
  const before = dryRunRecovery(inputs);
  checkPublicKey(before.publicKey, opts.expectedPublicKey);

  const setId = opts.setId ?? newShareSetId();
  if (before.setId !== undefined && before.setId === setId) {
    throw new InputError('duplicate', 'new set id must differ from the old one', 'set-id');
  }

  const secret = combineShares(inputs.map((i) => ({ x: i.backup.share.x, y: i.backup.share.y })));
  let shares: Share[];
  try {
    shares = splitSecret(secret, opts.threshold, opts.total);
  } finally {
    secret.fill(0);
  }

  // Prove the new set before anyone relies on it: the lowest and highest
  // `threshold` shares must each rebuild the same public key.
  const windows = [shares.slice(0, opts.threshold), shares.slice(-opts.threshold)];
  for (const subset of windows) {
    const rebuilt = combineShares(subset);
    try {
      if (bytesToHex(getPublicKeyCompressed(rebuilt)) !== before.publicKey) {
        throw new Error('rotated shares do not rebuild the original key');
      }
    } finally {
      rebuilt.fill(0);
    }
  }

  const set: ShareSetInfo = { id: setId, threshold: opts.threshold, total: opts.total };
  const out: RotatedShareSet = { publicKey: before.publicKey, set, shares };
  if (before.setId !== undefined) out.oldSetId = before.setId;
  return out;
}

export type RotateFilesOptions = RotateOptions & {
  /** Password for the old files (if encrypted). */
  password?: string;
  /** Password for the new files. Required when any old file was encrypted. */
  newPassword?: string;
  /** Explicitly allow writing plaintext shares from encrypted backups. */
  allowPlaintext?: boolean;
  /** Directory for the new files; created files never overwrite anything. */
  outDir: string;
  /** Leave old files in place instead of renaming them to `*.retired`. */
  keepOld?: boolean;
};

export type RotateFilesReport = {
  ok: true;
  publicKey: string;
  oldSetId?: string;
  newSetId: string;
  threshold: number;
  total: number;
  encrypted: boolean;
  written: string[];
  retired: string[];
};

/** File name for one share of a rotated set. */
export function rotatedShareFileName(setId: string, x: number): string {
  return `share-${setId}-${x}.json`;
}

/**
 * Rotate share backup files. Order matters for safety:
 * 1. read and verify the old files, 2. write the new set with `wx` so nothing
 * is overwritten, 3. re-read the new files and dry-run them against the same
 * public key, 4. only then rename the old files to `<name>.retired`.
 * If anything fails before step 4, new files are removed and old ones stay.
 */
export async function rotateShareFiles(
  files: string[],
  opts: RotateFilesOptions
): Promise<RotateFilesReport> {
  if (typeof opts?.outDir !== 'string' || opts.outDir.trim() === '') {
    throw new InputError('missing-value', '--out-dir <dir> is required', 'out-dir');
  }
  const inputs = await loadShareInputs(files, { password: opts.password });
  const anyEncrypted = inputs.some((i) => i.encrypted === true);
  if (anyEncrypted && opts.newPassword === undefined && opts.allowPlaintext !== true) {
    throw new InputError(
      'missing-value',
      'old shares are encrypted; pass --new-password (or --allow-plaintext) for the new set',
      'new-password'
    );
  }

  const rotated = rotateShareSet(inputs, opts);
  const written: string[] = [];
  try {
    for (const share of rotated.shares) {
      const path = join(opts.outDir, rotatedShareFileName(rotated.set.id, share.x));
      const json = encodeShare(share, rotated.set);
      const body = opts.newPassword !== undefined ? await encryptString(json, opts.newPassword) : json;
      await writeFile(path, body, { encoding: 'utf8', flag: 'wx' });
      written.push(path);
    }
    const check = dryRunRecovery(await loadShareInputs(written, { password: opts.newPassword }));
    if (check.publicKey !== rotated.publicKey || check.setId !== rotated.set.id) {
      throw new Error('written shares do not rebuild the original key');
    }
  } catch (err) {
    await Promise.all(written.map((p) => rm(p, { force: true })));
    throw err;
  } finally {
    for (const s of rotated.shares) s.y.fill(0);
  }

  const retired: string[] = [];
  if (opts.keepOld !== true) {
    for (const path of files) {
      const target = path + RETIRED_SUFFIX;
      await rename(path, target);
      retired.push(target);
    }
  }

  const report: RotateFilesReport = {
    ok: true,
    publicKey: rotated.publicKey,
    newSetId: rotated.set.id,
    threshold: rotated.set.threshold,
    total: rotated.set.total,
    encrypted: opts.newPassword !== undefined,
    written,
    retired,
  };
  if (rotated.oldSetId !== undefined) report.oldSetId = rotated.oldSetId;
  return report;
}

/** List `*.retired` files left in a directory by earlier rotations. */
export async function listRetiredShareFiles(dir: string): Promise<string[]> {
  const names = await readdir(dir);
  return names.filter((n) => n.endsWith(RETIRED_SUFFIX)).sort().map((n) => join(dir, n));
}

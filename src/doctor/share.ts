import { decryptToString, isEncryptedEnvelope } from '../encoding/encrypted.js';
import {
  assertCompatibleShareSet,
  decodeShareBackup,
  type DecodedShareBackup,
} from '../encoding/share.js';
import { InputError } from '../errors/input.js';
import { assertPath, errorMessage, fail, readExistingFile } from './files.js';
import type { DoctorCheck } from './types.js';

function shareCheck(
  path: string,
  backup: DecodedShareBackup,
  encrypted: boolean
): DoctorCheck {
  const check: DoctorCheck = {
    ok: true,
    kind: 'share',
    target: path,
    codes: [],
    detail: `share x=${backup.share.x}`,
    encrypted,
    x: backup.share.x,
    sourceVersion: backup.sourceVersion,
  };
  if (backup.set) {
    check.setId = backup.set.id;
    check.threshold = backup.set.threshold;
    check.detail = `share x=${backup.share.x} in set ${backup.set.id}`;
  }
  return check;
}

type ShareInspect = { check: DoctorCheck; backup?: DecodedShareBackup };

async function inspectShareFile(path: string, password?: string): Promise<ShareInspect> {
  const filePath = assertPath(path, 'shares');
  const file = await readExistingFile(filePath);
  if (!file.ok) return { check: fail('share', filePath, [file.code], file.detail) };

  let json = file.text;
  let encrypted = false;
  if (isEncryptedEnvelope(json)) {
    encrypted = true;
    if (password === undefined || password === '') {
      return {
        check: fail('share', filePath, ['needs-password'], 'encrypted share needs --password to check integrity'),
      };
    }
    try {
      json = await decryptToString(json, password);
    } catch (err) {
      return { check: fail('share', filePath, ['decrypt-failed'], errorMessage(err)) };
    }
  }

  try {
    const backup = decodeShareBackup(json);
    return { check: shareCheck(filePath, backup, encrypted), backup };
  } catch (err) {
    return { check: fail('share', filePath, ['invalid-backup'], errorMessage(err)) };
  }
}

/**
 * Decode one share backup and report integrity without reconstructing the secret.
 */
export async function checkShareFile(path: string, password?: string): Promise<DoctorCheck> {
  return (await inspectShareFile(path, password)).check;
}

/**
 * Check each backup, then that tagged files belong to one split with enough shares.
 * Does not combine the secret.
 */
export async function checkShareFiles(paths: string[], password?: string): Promise<DoctorCheck[]> {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new InputError('too-few', 'need at least one share file', 'shares');
  }
  const checks: DoctorCheck[] = [];
  const backups: DecodedShareBackup[] = [];
  const originByX = new Map<number, string>();

  for (const path of paths) {
    const { check, backup } = await inspectShareFile(path, password);
    checks.push(check);
    if (!check.ok || !backup) continue;
    const prev = originByX.get(backup.share.x);
    if (prev !== undefined) {
      checks.push(
        fail('share', path, ['duplicate'], `duplicate share x=${backup.share.x} in ${prev} and ${path}`)
      );
      continue;
    }
    originByX.set(backup.share.x, path);
    backups.push(backup);
  }

  if (backups.length === paths.length) {
    try {
      const set = assertCompatibleShareSet(backups);
      const summary: DoctorCheck = {
        ok: true,
        kind: 'share',
        target: paths.join(','),
        codes: [],
        detail: set
          ? `${backups.length} shares from set ${set.id} (threshold ${set.threshold})`
          : `${backups.length} untagged shares`,
        shareCount: backups.length,
      };
      if (set) {
        summary.setId = set.id;
        summary.threshold = set.threshold;
      }
      checks.push(summary);
    } catch (err) {
      checks.push(fail('share', paths.join(','), ['incompatible-set'], errorMessage(err)));
    }
  }

  return checks;
}

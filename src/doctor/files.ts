import { readFile, stat } from 'node:fs/promises';
import { InputError } from '../errors/input.js';
import type { DoctorCheck, DoctorKind } from './types.js';

export type FileRead =
  | { ok: true; text: string }
  | { ok: false; code: 'missing-file' | 'not-a-file'; detail: string };

export function assertPath(path: unknown, field: string): string {
  if (typeof path !== 'string' || path.trim() === '') {
    throw new InputError('missing-value', `${field} path is required`, field);
  }
  return path;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error && err.message ? err.message : String(err);
}

export function fail(kind: DoctorKind, target: string, codes: string[], detail: string): DoctorCheck {
  return { ok: false, kind, target, codes, detail };
}

export async function readExistingFile(path: string): Promise<FileRead> {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return { ok: false, code: 'not-a-file', detail: `not a regular file: ${path}` };
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: false, code: 'missing-file', detail: `missing file: ${path}` };
    }
    throw err;
  }
  return { ok: true, text: await readFile(path, 'utf8') };
}

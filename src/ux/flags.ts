/**
 * Read CLI flags as strings or integers. A bare `--flag` is boolean true
 * in parseArgs; value-taking flags must reject that instead of coercing.
 */

import { InputError } from '../errors/input.js';
import type { FlagMap } from './output.js';

function firstPresent(args: FlagMap, names: string[]): { name: string; value: unknown } | undefined {
  for (const name of names) {
    if (args[name] !== undefined) return { name, value: args[name] };
  }
  return undefined;
}

/** Optional string flag. A bare `--name` (boolean true) is a missing value. */
export function optionalFlagString(args: FlagMap, name: string, aliases: string[] = []): string | undefined {
  const found = firstPresent(args, [name, ...aliases]);
  if (!found) return undefined;
  if (typeof found.value !== 'string' || found.value.trim() === '') {
    throw new InputError('missing-value', `--${name} requires a value`, name);
  }
  return found.value;
}

/** Required string flag. */
export function requireFlagString(
  args: FlagMap,
  name: string,
  opts?: { aliases?: string[]; message?: string }
): string {
  const value = optionalFlagString(args, name, opts?.aliases ?? []);
  if (value === undefined) {
    throw new InputError('missing-value', opts?.message ?? `--${name} is required`, name);
  }
  return value;
}

/**
 * Optional integer flag. Rejects booleans, floats, and non-numeric strings.
 * Accepts a numeric value for programmatic callers.
 */
export function optionalFlagInt(args: FlagMap, name: string, aliases: string[] = []): number | undefined {
  const found = firstPresent(args, [name, ...aliases]);
  if (!found) return undefined;
  const flag = `--${name}`;
  if (typeof found.value === 'boolean') {
    throw new InputError('missing-value', `${flag} requires an integer value`, name);
  }
  if (typeof found.value === 'number') {
    if (!Number.isInteger(found.value)) {
      throw new InputError('invalid-integer', `${flag} must be an integer`, name);
    }
    return found.value;
  }
  if (typeof found.value !== 'string' || !/^-?\d+$/.test(found.value.trim())) {
    throw new InputError('invalid-integer', `${flag} must be an integer`, name);
  }
  return Number(found.value.trim());
}

/** Split a comma-separated path list and require at least `minCount` entries. */
export function parsePathList(raw: string, opts?: { minCount?: number; flag?: string }): string[] {
  if (typeof raw !== 'string') {
    throw new InputError('invalid-type', `--${opts?.flag ?? 'files'} requires a comma-separated list of paths`, opts?.flag);
  }
  const minCount = opts?.minCount ?? 1;
  const flag = opts?.flag ?? 'files';
  const files = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (files.length < minCount) {
    throw new InputError('too-few', `need at least ${minCount} files`, flag);
  }
  return files;
}

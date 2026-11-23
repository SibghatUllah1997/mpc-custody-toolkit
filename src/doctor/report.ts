import { InputError } from '../errors/input.js';
import { checkAuditLog } from './audit.js';
import { checkShareFiles } from './share.js';
import type { DoctorCheck, DoctorReport, DoctorTargets } from './types.js';

/**
 * Run every requested integrity check. Throws only when the caller named
 * no targets; file-level problems are reported on the checks themselves.
 */
export async function runDoctor(targets: DoctorTargets): Promise<DoctorReport> {
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
    throw new InputError('invalid-type', 'doctor targets must be an object', 'targets');
  }
  const checks: DoctorCheck[] = [];
  if (targets.shares !== undefined) {
    checks.push(...(await checkShareFiles(targets.shares, targets.password)));
  }
  if (targets.audit !== undefined) {
    checks.push(await checkAuditLog(targets.audit));
  }
  if (checks.length === 0) {
    throw new InputError('missing-value', 'doctor needs at least one share file or audit log', 'targets');
  }
  return { ok: checks.every((c) => c.ok), checks };
}

import { InputError } from '../errors/input.js';
import { checkAuditLog } from './audit.js';
import { checkQueueFile } from './queue.js';
import { checkShareFiles } from './share.js';
import { checkSpentLog } from './spent.js';
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
  if (targets.spent !== undefined) {
    checks.push(await checkSpentLog(targets.spent));
  }
  if (targets.queue !== undefined) {
    checks.push(await checkQueueFile(targets.queue));
  }
  if (checks.length === 0) {
    throw new InputError(
      'missing-value',
      'doctor needs --shares, --audit, --spent-log, or --queue',
      'targets'
    );
  }
  return { ok: checks.every((c) => c.ok), checks };
}

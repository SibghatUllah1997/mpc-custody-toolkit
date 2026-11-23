import { readAuditLog } from '../audit/store.js';
import { assertPath, errorMessage, fail, readExistingFile } from './files.js';
import type { DoctorCheck } from './types.js';

/**
 * Confirm an audit log file exists and its hash chain is intact.
 */
export async function checkAuditLog(path: string): Promise<DoctorCheck> {
  const filePath = assertPath(path, 'audit');
  const file = await readExistingFile(filePath);
  if (!file.ok) return fail('audit', filePath, [file.code], file.detail);
  try {
    const events = await readAuditLog(filePath);
    return {
      ok: true,
      kind: 'audit',
      target: filePath,
      codes: [],
      detail: events.length === 0 ? 'empty audit log' : `${events.length} event(s), chain intact`,
      events: events.length,
    };
  } catch (err) {
    return fail('audit', filePath, ['invalid-audit'], errorMessage(err));
  }
}

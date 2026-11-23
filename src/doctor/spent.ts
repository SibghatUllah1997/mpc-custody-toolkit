import { readSpentLog } from '../airgap/spent.js';
import { assertPath, errorMessage, fail, readExistingFile } from './files.js';
import type { DoctorCheck } from './types.js';

/**
 * Confirm a spent-request log exists and every line decodes with a unique id.
 */
export async function checkSpentLog(path: string): Promise<DoctorCheck> {
  const filePath = assertPath(path, 'spent-log');
  const file = await readExistingFile(filePath);
  if (!file.ok) return fail('spent', filePath, [file.code], file.detail);
  try {
    const records = await readSpentLog(filePath);
    return {
      ok: true,
      kind: 'spent',
      target: filePath,
      codes: [],
      detail: records.length === 0 ? 'empty spent-request log' : `${records.length} spent request(s)`,
      records: records.length,
    };
  } catch (err) {
    return fail('spent', filePath, ['invalid-spent'], errorMessage(err));
  }
}

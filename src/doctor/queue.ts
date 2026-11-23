import { decodeApprovalQueue, inspectApprovalItem } from '../queue/index.js';
import { assertPath, errorMessage, fail, readExistingFile } from './files.js';
import type { DoctorCheck } from './types.js';

/**
 * Confirm an approval-queue file decodes and checksums, then count ready and expired items.
 */
export async function checkQueueFile(path: string, now: Date = new Date()): Promise<DoctorCheck> {
  const filePath = assertPath(path, 'queue');
  const file = await readExistingFile(filePath);
  if (!file.ok) return fail('queue', filePath, [file.code], file.detail);
  try {
    const queue = decodeApprovalQueue(file.text);
    let ready = 0;
    let expired = 0;
    for (const item of queue.items) {
      const status = inspectApprovalItem(item, now);
      if (status.expired) expired += 1;
      else if (status.ready) ready += 1;
    }
    return {
      ok: true,
      kind: 'queue',
      target: filePath,
      codes: [],
      detail: `${queue.items.length} item(s), ${ready} ready, ${expired} expired`,
      items: queue.items.length,
      ready,
      expired,
    };
  } catch (err) {
    return fail('queue', filePath, ['invalid-queue'], errorMessage(err));
  }
}

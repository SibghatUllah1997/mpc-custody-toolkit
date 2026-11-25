import {
  assertNotesNewestFirst,
  extractReleaseNotes,
  listReleaseVersions,
  missingNoteHeadings,
  missingNoteTopics,
} from './notes.js';
import { assertTagMatchesVersion, formatSemver, parseSemver, tagForVersion } from './version.js';

export type ReleaseReadyInput = {
  markdown: string;
  version: string;
  tag?: string;
  topics?: readonly string[];
};

export type ReleaseReadyReport = {
  ok: boolean;
  version: string;
  tag: string;
  latestNotes: string | undefined;
  codes: string[];
};

function pushCode(codes: string[], code: string): void {
  if (!codes.includes(code)) codes.push(code);
}

/**
 * Confirm a notes file can be published for `version`. Failures are collected
 * as codes rather than thrown, so the CLI can print the whole report.
 */
export function checkReleaseReady(input: ReleaseReadyInput): ReleaseReadyReport {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('release-ready input must be an object');
  }
  if (typeof input.markdown !== 'string') throw new Error('markdown must be a string');
  const version = formatSemver(parseSemver(input.version));
  const codes: string[] = [];
  const tag = tagForVersion(version);

  if (input.tag !== undefined) {
    try {
      assertTagMatchesVersion(input.tag, version);
    } catch {
      pushCode(codes, 'tag-mismatch');
    }
  }

  try {
    assertNotesNewestFirst(input.markdown);
  } catch {
    pushCode(codes, 'notes-not-newest');
  }

  const listed = listReleaseVersions(input.markdown);
  const latestNotes = listed[0];
  if (latestNotes !== version) pushCode(codes, 'notes-not-current');

  try {
    const body = extractReleaseNotes(input.markdown, version);
    if (missingNoteHeadings(body).length > 0) pushCode(codes, 'notes-missing-heading');
    if (missingNoteTopics(body, input.topics ?? []).length > 0) pushCode(codes, 'notes-missing-topic');
  } catch {
    pushCode(codes, 'notes-missing-version');
  }

  return { ok: codes.length === 0, version, tag, latestNotes, codes };
}

export function assertReleaseReady(input: ReleaseReadyInput): ReleaseReadyReport {
  const report = checkReleaseReady(input);
  if (!report.ok) {
    throw new Error(`release is not ready (${report.codes.join(', ')})`);
  }
  return report;
}

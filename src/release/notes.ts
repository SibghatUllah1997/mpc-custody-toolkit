import { compareSemver, formatSemver, parseSemver } from './version.js';

/**
 * Pull one version's section out of a release-notes markdown file.
 *
 * Sections start with a level-2 heading `## v<version>` (an optional
 * trailing ` — date` or `(date)` is allowed) and run until the next level-2
 * heading. The heading itself is dropped; surrounding blank lines are trimmed.
 */
export function extractReleaseNotes(markdown: string, version: string): string {
  if (typeof markdown !== 'string') throw new Error('markdown must be a string');
  const want = formatSemver(parseSemver(version.startsWith('v') ? version.slice(1) : version));
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const heading = /^##\s+v(\S+?)(?:\s+.*)?$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = heading.exec(lines[i]);
    if (!m) continue;
    if (start >= 0) {
      return finish(lines.slice(start, i), want);
    }
    if (m[1] === want) start = i + 1;
  }
  if (start < 0) throw new Error(`no release notes for v${want}`);
  return finish(lines.slice(start), want);
}

function finish(body: string[], version: string): string {
  const text = body.join('\n').trim();
  if (!text) throw new Error(`release notes for v${version} are empty`);
  return `${text}\n`;
}

/** Versions listed in a release-notes file, newest first as written. */
export function listReleaseVersions(markdown: string): string[] {
  if (typeof markdown !== 'string') throw new Error('markdown must be a string');
  const out: string[] = [];
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const m = /^##\s+v(\S+?)(?:\s+.*)?$/.exec(line);
    if (m) out.push(formatSemver(parseSemver(m[1])));
  }
  return out;
}

/** Headings every version section is expected to carry. */
export const REQUIRED_NOTE_HEADINGS = ["What's in it", 'Compatibility', 'Known limits'] as const;

const HEADING_LINE = /^###\s+(.+?)\s*$/;

function headingTitles(body: string): string[] {
  const titles: string[] = [];
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const m = HEADING_LINE.exec(line);
    if (m) titles.push(m[1]);
  }
  return titles;
}

/** Names from `REQUIRED_NOTE_HEADINGS` that do not appear as `###` headings. */
export function missingNoteHeadings(body: string): string[] {
  if (typeof body !== 'string') throw new Error('notes body must be a string');
  const have = new Set(headingTitles(body).map((t) => t.toLowerCase()));
  return REQUIRED_NOTE_HEADINGS.filter((h) => !have.has(h.toLowerCase()));
}

/** Topics that do not appear as a case-insensitive substring of the body. */
export function missingNoteTopics(body: string, topics: readonly string[]): string[] {
  if (typeof body !== 'string') throw new Error('notes body must be a string');
  if (!Array.isArray(topics)) throw new Error('topics must be an array');
  const haystack = body.toLowerCase();
  const missing: string[] = [];
  for (const topic of topics) {
    if (typeof topic !== 'string' || topic.trim() === '') {
      throw new Error('topics must be non-empty strings');
    }
    if (!haystack.includes(topic.toLowerCase())) missing.push(topic);
  }
  return missing;
}

/**
 * Throws unless the notes body has the usual `###` sections. Extra `topics`
 * are matched case-insensitively as substrings of the body.
 */
export function assertNotesCover(body: string, topics: readonly string[] = []): void {
  if (!Array.isArray(topics)) throw new Error('topics must be an array');
  const headings = missingNoteHeadings(body);
  if (headings.length > 0) {
    throw new Error(`release notes missing heading: ${headings.join(', ')}`);
  }
  const missing = missingNoteTopics(body, topics);
  if (missing.length > 0) {
    throw new Error(`release notes missing topic: ${missing.join(', ')}`);
  }
}

/** Throws unless version headings are strictly newest-first. */
export function assertNotesNewestFirst(markdown: string): void {
  const versions = listReleaseVersions(markdown);
  for (let i = 1; i < versions.length; i++) {
    if (compareSemver(versions[i - 1], versions[i]) <= 0) {
      throw new Error(`release notes are not newest-first: v${versions[i - 1]} then v${versions[i]}`);
    }
  }
}

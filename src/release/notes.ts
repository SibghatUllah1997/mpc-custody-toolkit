import { formatSemver, parseSemver } from './version.js';

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

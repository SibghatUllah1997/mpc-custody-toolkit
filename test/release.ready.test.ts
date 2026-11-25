import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { Release } from '../src';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const notesFile = readFileSync(join(repoRoot, 'docs/RELEASE_NOTES.md'), 'utf8');

const complete = [
  "### What's in it",
  '',
  '- Argon2id backups and an air-gap flow with a spent-request log.',
  '',
  '### Compatibility',
  '',
  '- Node 20 or newer.',
  '',
  '### Known limits',
  '',
  '- No real MPC rounds.',
  '',
].join('\n');

function notesFor(version: string, body = complete): string {
  return `# Release notes\n\n## v${version} — 2026-11-25\n\n${body}`;
}

describe('checkReleaseReady', () => {
  it('accepts the committed notes for the current package version', () => {
    const report = Release.checkReleaseReady({ markdown: notesFile, version: Release.VERSION });
    expect(report).toMatchObject({
      ok: true,
      version: Release.VERSION,
      tag: Release.tagForVersion(Release.VERSION),
      latestNotes: Release.VERSION,
      codes: [],
    });
    expect(() =>
      Release.assertReleaseReady({ markdown: notesFile, version: Release.VERSION, tag: report.tag })
    ).not.toThrow();
  });

  it('collects every problem instead of stopping at the first', () => {
    const markdown = ['## v0.0.9', '', '### Compatibility', '', '- old', ''].join('\n');
    const report = Release.checkReleaseReady({
      markdown,
      version: '0.2.0',
      tag: 'v9.9.9',
      topics: ['Argon2id'],
    });
    expect(report.ok).toBe(false);
    expect(report.codes).toEqual([
      'tag-mismatch',
      'notes-not-current',
      'notes-missing-version',
    ]);
    expect(() => Release.assertReleaseReady({ markdown, version: '0.2.0' })).toThrow(
      /release is not ready/
    );
  });

  it('flags notes that are out of order or missing headings', () => {
    const outOfOrder = `## v0.1.0\n\n${complete}## v0.2.0\n\n${complete}`;
    expect(Release.checkReleaseReady({ markdown: outOfOrder, version: '0.2.0' }).codes).toContain(
      'notes-not-newest'
    );
    const thin = notesFor('0.1.0', '### Compatibility\n\n- Node 20.\n');
    const report = Release.checkReleaseReady({ markdown: thin, version: '0.1.0', topics: ['spent-request'] });
    expect(report.codes).toEqual(['notes-missing-heading', 'notes-missing-topic']);
  });

  it('rejects a malformed input object', () => {
    expect(() => Release.checkReleaseReady(3 as unknown as Release.ReleaseReadyInput)).toThrow(
      /must be an object/
    );
    expect(() =>
      Release.checkReleaseReady({ markdown: 1 as unknown as string, version: '0.1.0' })
    ).toThrow(/markdown must be a string/);
  });
});

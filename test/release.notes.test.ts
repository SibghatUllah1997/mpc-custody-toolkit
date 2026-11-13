import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { Release } from '../src';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const notesFile = readFileSync(join(repoRoot, 'docs/RELEASE_NOTES.md'), 'utf8');

const sample = [
  '# Release notes',
  '',
  '## v0.2.0 (2026-12-01)',
  '',
  '- second',
  '',
  '## v0.1.0 — 2026-11-13',
  '',
  '- first',
  '- more',
  '',
].join('\n');

describe('release notes', () => {
  it('extracts one section without its heading', () => {
    expect(Release.extractReleaseNotes(sample, '0.2.0')).toBe('- second\n');
    expect(Release.extractReleaseNotes(sample, 'v0.1.0')).toBe('- first\n- more\n');
  });

  it('handles CRLF input', () => {
    expect(Release.extractReleaseNotes(sample.replace(/\n/g, '\r\n'), '0.1.0')).toBe('- first\n- more\n');
  });

  it('fails on a missing or empty section', () => {
    expect(() => Release.extractReleaseNotes(sample, '0.3.0')).toThrow(/no release notes for v0.3.0/);
    expect(() => Release.extractReleaseNotes('## v1.0.0\n\n## v0.9.0\nx\n', '1.0.0')).toThrow(/empty/);
    expect(() => Release.extractReleaseNotes(sample, 'latest')).toThrow(/not a semver/);
  });

  it('does not match a version that only shares a prefix', () => {
    expect(() => Release.extractReleaseNotes('## v0.1.0-rc.1\n- rc\n', '0.1.0')).toThrow(/no release notes/);
  });

  it('lists versions in file order', () => {
    expect(Release.listReleaseVersions(sample)).toEqual(['0.2.0', '0.1.0']);
  });

  it('has notes for the current package version in docs/RELEASE_NOTES.md', () => {
    expect(Release.listReleaseVersions(notesFile)[0]).toBe(Release.VERSION);
    const body = Release.extractReleaseNotes(notesFile, Release.VERSION);
    expect(body).toMatch(/THREAT_MODEL\.md/);
    expect(body).toMatch(/Known limits/);
  });
});

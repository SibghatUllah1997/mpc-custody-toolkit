import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parseArgs, releaseCheckFromArgs, releaseNotesFromArgs } from '../src/cli';
import { Release } from '../src';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const notesPath = join(repoRoot, 'docs/RELEASE_NOTES.md');

describe('CLI release helpers', () => {
  it('prints notes for the current version, checking the tag', async () => {
    const tag = Release.tagForVersion(Release.VERSION);
    const notes = await releaseNotesFromArgs(parseArgs(['release-notes', '--tag', tag, '--file', notesPath]));
    expect(notes).toBe(Release.extractReleaseNotes(readFileSync(notesPath, 'utf8'), Release.VERSION));
  });

  it('refuses a tag for another version', async () => {
    await expect(
      releaseNotesFromArgs(parseArgs(['release-notes', '--tag', 'v9.9.9', '--file', notesPath]))
    ).rejects.toThrow(/does not match/);
  });

  it('fails when the file has no section for this version', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'notes-'));
    const file = join(dir, 'NOTES.md');
    writeFileSync(file, '## v0.0.9\n- old\n');
    await expect(releaseNotesFromArgs(parseArgs(['release-notes', '--file', file]))).rejects.toThrow(
      /no release notes/
    );
  });

  it('reports ready for the committed notes and not ready for a stub file', async () => {
    const tag = Release.tagForVersion(Release.VERSION);
    const ok = await releaseCheckFromArgs(parseArgs(['release-check', '--tag', tag, '--file', notesPath]));
    expect(ok).toMatchObject({ ok: true, version: Release.VERSION, tag, codes: [] });
    const dir = mkdtempSync(join(tmpdir(), 'notes-'));
    const file = join(dir, 'NOTES.md');
    writeFileSync(file, '## v0.0.9\n- old\n');
    const bad = await releaseCheckFromArgs(parseArgs(['release-check', '--file', file]));
    expect(bad.ok).toBe(false);
    expect(bad.codes).toContain('notes-not-current');
  });

  const cli = join(repoRoot, 'dist/src/cli.js');
  it.skipIf(!existsSync(cli))('reports the version from the built CLI', () => {
    const plain = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
    expect(plain.status).toBe(0);
    expect(plain.stdout.trim()).toBe(Release.VERSION);
    const json = spawnSync(process.execPath, [cli, 'version', '--json'], { encoding: 'utf8' });
    expect(JSON.parse(json.stdout)).toEqual({ version: Release.VERSION });
  });

  it.skipIf(!existsSync(cli))('exits non-zero when release-check fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'notes-cli-'));
    const file = join(dir, 'NOTES.md');
    writeFileSync(file, '## v0.0.9\n- old\n');
    const res = spawnSync(process.execPath, [cli, 'release-check', '--file', file, '--json'], {
      encoding: 'utf8',
    });
    expect(res.status).toBe(1);
    const report = JSON.parse(res.stdout);
    expect(report.ok).toBe(false);
    expect(report.codes).toContain('notes-missing-version');
  });
});

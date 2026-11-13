import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parseArgs, releaseNotesFromArgs } from '../src/cli';
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

  const cli = join(repoRoot, 'dist/src/cli.js');
  it.skipIf(!existsSync(cli))('reports the version from the built CLI', () => {
    const plain = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
    expect(plain.status).toBe(0);
    expect(plain.stdout.trim()).toBe(Release.VERSION);
    const json = spawnSync(process.execPath, [cli, 'version', '--json'], { encoding: 'utf8' });
    expect(JSON.parse(json.stdout)).toEqual({ version: Release.VERSION });
  });
});

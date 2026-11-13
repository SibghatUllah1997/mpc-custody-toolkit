import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { Release } from '../src';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const lock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'));

describe('release version', () => {
  it('keeps VERSION, package.json, and the lockfile in step', () => {
    expect(Release.VERSION).toBe(pkg.version);
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });

  it('parses and formats semver', () => {
    expect(Release.parseSemver('0.1.0')).toEqual({ major: 0, minor: 1, patch: 0 });
    expect(Release.parseSemver('1.2.3-rc.1')).toEqual({ major: 1, minor: 2, patch: 3, pre: 'rc.1' });
    expect(Release.formatSemver(Release.parseSemver(' 2.0.10 '))).toBe('2.0.10');
    expect(Release.tagForVersion('0.1.0')).toBe('v0.1.0');
  });

  it('rejects malformed versions', () => {
    for (const bad of ['', '1', '1.2', '01.2.3', '1.2.3.4', 'v1.2.3', '1.2.3-', '1.2.x']) {
      expect(() => Release.parseSemver(bad), bad).toThrow(/not a semver/);
    }
    expect(() => Release.parseSemver(3 as unknown as string)).toThrow(/must be a string/);
  });

  it('only accepts the tag that matches the package version', () => {
    expect(() => Release.assertTagMatchesVersion('v0.1.0', '0.1.0')).not.toThrow();
    expect(() => Release.assertTagMatchesVersion('v0.1.1', '0.1.0')).toThrow(/does not match/);
    expect(() => Release.assertTagMatchesVersion('0.1.0', '0.1.0')).toThrow(/start with "v"/);
    expect(() => Release.assertTagMatchesVersion('v0.1.0-rc.1', '0.1.0')).toThrow(/does not match/);
    expect(() => Release.assertTagMatchesVersion('vnext', '0.1.0')).toThrow(/not a semver/);
  });
});

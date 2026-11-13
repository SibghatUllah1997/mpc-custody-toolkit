import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const ci = readFileSync(join(repoRoot, '.github/workflows/ci.yml'), 'utf8');

describe('CI matrix and coverage', () => {
  it('tests Node 20, 22, and 24', () => {
    expect(ci).toMatch(/node-version: \[20, 22, 24\]/);
    expect(ci).toMatch(/fail-fast: false/);
    expect(pkg.engines.node).toBe('>=20.0.0');
  });

  it('runs coverage and uploads lcov', () => {
    expect(pkg.scripts['test:coverage']).toBe('vitest run --coverage');
    expect(pkg.devDependencies['@vitest/coverage-v8']).toBeDefined();
    expect(ci).toMatch(/npm run test:coverage/);
    expect(ci).toMatch(/coverage\/lcov\.info/);
  });

  it('runs the foundation roundtrip after build and tests', () => {
    const buildAt = ci.indexOf('npm run build');
    const testAt = ci.indexOf('npm test');
    const checkAt = ci.indexOf('node dist/src/cli.js check --json');
    expect(buildAt).toBeGreaterThan(-1);
    expect(testAt).toBeGreaterThan(buildAt);
    expect(checkAt).toBeGreaterThan(testAt);
  });
});

describe('release workflow', () => {
  const release = readFileSync(join(repoRoot, '.github/workflows/release.yml'), 'utf8');

  it('runs only on version tags and can write releases', () => {
    expect(release).toMatch(/tags: \['v\*\.\*\.\*'\]/);
    expect(release).toMatch(/contents: write/);
  });

  it('builds and tests before checking the tag and publishing notes', () => {
    const order = ['npm run build', 'npm test', 'release-notes --tag "$GITHUB_REF_NAME"', 'gh release create'];
    const idx = order.map((s) => release.indexOf(s));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(release).toMatch(/--notes-file release-notes\.md/);
  });

  it('attaches the built docs site to the release', () => {
    expect(release).toMatch(/mdbook build website/);
    expect(release).toMatch(/gh release create .*"docs-site-\$GITHUB_REF_NAME\.tar\.gz"/);
  });
});

describe('docs workflow', () => {
  const docs = readFileSync(join(repoRoot, '.github/workflows/docs.yml'), 'utf8');

  it('keeps the built site and gates the Pages deploy on PAGES_ENABLED', () => {
    expect(docs).toMatch(/name: docs-site/);
    expect(docs).toMatch(/deploy:\n    if: .*vars\.PAGES_ENABLED == 'true'/);
  });
});

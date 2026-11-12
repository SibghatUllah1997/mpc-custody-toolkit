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
});

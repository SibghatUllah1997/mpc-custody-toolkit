import { spawnSync } from 'child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('package entry point', () => {
  it('points main, types, and exports at the compiled src tree', () => {
    expect(pkg.main).toBe('./dist/src/index.js');
    expect(pkg.types).toBe('./dist/src/index.d.ts');
    expect(pkg.exports['.']).toEqual({ types: './dist/src/index.d.ts', import: './dist/src/index.js' });
  });

  it('uses .js suffixes on every relative import in src', () => {
    const bad: string[] = [];
    const spec = /(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g;
    for (const file of sourceFiles(join(repoRoot, 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(spec)) {
        if (!m[1].endsWith('.js')) bad.push(`${relative(repoRoot, file)}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  const built = join(repoRoot, 'dist/src/index.js');
  it.skipIf(!existsSync(built))('loads the built entry under plain Node', () => {
    const script = `import(${JSON.stringify(built)}).then((m) => console.log(Object.keys(m).sort().join(',')))`;
    const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    expect(res.stderr).toBe('');
    const names = res.stdout.trim().split(',');
    for (const ns of ['Shamir', 'Secp256k1', 'Policy', 'Threshold', 'Docs', 'encodeShare']) {
      expect(names).toContain(ns);
    }
  });
});

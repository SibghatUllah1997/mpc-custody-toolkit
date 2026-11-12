import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import * as Root from '../src';
import { Docs } from '../src';
import { extractApiEntries } from './support/api-extract';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiPath = join(repoRoot, 'docs/API.md');

describe('generated API reference', () => {
  const entries = extractApiEntries(join(repoRoot, 'src/index.ts'), join(repoRoot, 'tsconfig.json'));
  const rendered = Docs.renderApiReference(entries);
  if (process.env.UPDATE_API_DOCS === '1') writeFileSync(apiPath, rendered);

  it('lists every runtime value exported from the package root', () => {
    const listed = new Set(entries.map((e) => (e.namespace ? `${e.namespace}.${e.name}` : e.name)));
    const runtime: string[] = [];
    for (const [name, value] of Object.entries(Root)) {
      const isNs = value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Module]';
      if (isNs) runtime.push(...Object.keys(value).map((k) => `${name}.${k}`));
      else runtime.push(name);
    }
    expect(runtime.filter((n) => !listed.has(n))).toEqual([]);
  });

  it('includes type-only exports alongside values', () => {
    const share = entries.find((e) => e.namespace === 'Shamir' && e.name === 'Share');
    expect(share?.kind).toBe('type');
    const split = entries.find((e) => e.namespace === 'Shamir' && e.name === 'splitSecret');
    expect(split?.kind).toBe('function');
    expect(split?.signature).toMatch(/Uint8Array/);
  });

  it('matches the committed docs/API.md (run `npm run docs:api` to refresh)', () => {
    expect(readFileSync(apiPath, 'utf8')).toBe(rendered);
  });
});

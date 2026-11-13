import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { Docs } from '../src';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('docs page catalog', () => {
  it('uses unique ids and slugs', () => {
    const ids = Docs.DOC_PAGES.map((p) => p.id);
    const slugs = Docs.DOC_PAGES.map((p) => p.slug);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(ids.length).toBeGreaterThanOrEqual(8);
  });

  it('points every page at a markdown file that exists in the repo', () => {
    for (const page of Docs.DOC_PAGES) {
      expect(page.source.endsWith('.md'), page.id).toBe(true);
      expect(existsSync(join(repoRoot, page.source)), page.source).toBe(true);
      expect(Docs.bookDest(page)).toBe(`${page.slug}.md`);
    }
  });

  it('includes the Shamir timings page and groups by section', () => {
    const bench = Docs.findDocPage('benchmarks');
    expect(bench.source).toBe('docs/BENCHMARKS.md');
    expect(bench.section).toBe('reference');
    expect(Docs.pagesInSection('intro').map((p) => p.id)).toEqual(['overview', 'threat-model']);
    expect(Docs.pagesInSection('guides').length).toBeGreaterThanOrEqual(5);
    expect(Docs.pagesInSection('reference').map((p) => p.id)).toEqual(['api', 'benchmarks', 'release-notes']);
    expect(Docs.findDocPage('api').source).toBe('docs/API.md');
  });

  it('rejects an unknown page or section', () => {
    expect(() => Docs.findDocPage('no-such-page')).toThrow(/unknown doc page/);
    expect(() => Docs.pagesInSection('appendix' as Docs.DocSection)).toThrow(/unknown doc section/);
  });
});

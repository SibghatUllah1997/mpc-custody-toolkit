import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { Docs } from '../src';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('mdbook scaffold', () => {
  it('renders a SUMMARY that lists every catalog page once', () => {
    const summary = Docs.renderSummary();
    expect(summary.startsWith('# Summary\n')).toBe(true);
    for (const page of Docs.DOC_PAGES) {
      expect(summary).toContain(`- [${page.title}](${page.slug}.md)`);
    }
    expect(summary).toContain('# Introduction');
    expect(summary).toContain('# Guides');
    expect(summary).toContain('# Reference');
  });

  it('matches the committed book.toml and SUMMARY.md', () => {
    expect(readRepo('website/book.toml')).toBe(Docs.renderBookToml());
    expect(readRepo('website/src/SUMMARY.md')).toBe(Docs.renderSummary());
  });

  it('copies each catalog source into website/src', () => {
    const planned = Docs.planBookFiles((source) => readRepo(source));
    expect(planned.map((f) => f.path)).toContain('website/book.toml');
    for (const file of planned) {
      expect(readRepo(file.path)).toBe(file.contents);
    }
  });

  it('rejects a missing readSource callback', () => {
    expect(() => Docs.planBookFiles(undefined as unknown as (s: string) => string)).toThrow(
      /readSource must be a function/
    );
  });
});

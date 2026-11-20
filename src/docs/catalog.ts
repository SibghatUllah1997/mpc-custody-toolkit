export type DocSection = 'intro' | 'guides' | 'reference';

export type DocPage = {
  id: string;
  title: string;
  /** Filename used in the docs-site book (no directory). */
  slug: string;
  /** Repository-relative markdown source. */
  source: string;
  section: DocSection;
};

export const DOC_SECTIONS: ReadonlyArray<{ id: DocSection; title: string }> = [
  { id: 'intro', title: 'Introduction' },
  { id: 'guides', title: 'Guides' },
  { id: 'reference', title: 'Reference' },
];

export const DOC_PAGES: readonly DocPage[] = [
  { id: 'overview', title: 'Overview', slug: 'overview', source: 'README.md', section: 'intro' },
  { id: 'threat-model', title: 'Threat model', slug: 'threat-model', source: 'THREAT_MODEL.md', section: 'intro' },
  { id: 'foundation', title: 'Foundation roundtrip', slug: 'foundation', source: 'docs/FOUNDATION.md', section: 'guides' },
  { id: 'share-format', title: 'Share format', slug: 'share-format', source: 'docs/SHARE_FORMAT.md', section: 'guides' },
  { id: 'schemas', title: 'Versioned schemas', slug: 'schemas', source: 'docs/SCHEMAS.md', section: 'guides' },
  { id: 'policy', title: 'Policy engine', slug: 'policy', source: 'docs/POLICY.md', section: 'guides' },
  { id: 'simulation', title: 'Transaction simulation', slug: 'simulation', source: 'docs/SIMULATION.md', section: 'guides' },
  { id: 'threshold', title: 'Threshold signing', slug: 'threshold', source: 'docs/THRESHOLD.md', section: 'guides' },
  { id: 'airgap', title: 'Air-gap signing', slug: 'airgap', source: 'docs/AIRGAP.md', section: 'guides' },
  {
    id: 'custody-workflow',
    title: 'Custody workflow',
    slug: 'custody-workflow',
    source: 'docs/examples/custody-workflow.md',
    section: 'guides',
  },
  { id: 'api', title: 'API reference', slug: 'api', source: 'docs/API.md', section: 'reference' },
  { id: 'benchmarks', title: 'Shamir timings', slug: 'benchmarks', source: 'docs/BENCHMARKS.md', section: 'reference' },
  {
    id: 'release-notes',
    title: 'Release notes',
    slug: 'release-notes',
    source: 'docs/RELEASE_NOTES.md',
    section: 'reference',
  },
];

export function findDocPage(id: string): DocPage {
  const page = DOC_PAGES.find((p) => p.id === id);
  if (!page) throw new Error(`unknown doc page: ${id}`);
  return page;
}

export function pagesInSection(section: DocSection): DocPage[] {
  if (!DOC_SECTIONS.some((s) => s.id === section)) {
    throw new Error(`unknown doc section: ${section}`);
  }
  return DOC_PAGES.filter((p) => p.section === section);
}

export function bookDest(page: DocPage): string {
  if (!page?.slug) throw new Error('page slug is required');
  return `${page.slug}.md`;
}

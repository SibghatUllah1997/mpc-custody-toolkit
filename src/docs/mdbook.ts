import { bookDest, DOC_PAGES, DOC_SECTIONS, pagesInSection, type DocPage } from './catalog.js';

export const BOOK_ROOT = 'website';
export const BOOK_SRC = 'website/src';

export type BookFile = {
  path: string;
  contents: string;
};

export function renderBookToml(): string {
  return [
    '[book]',
    'title = "MPC Custody Toolkit"',
    'authors = ["HM Sibghat Ullah"]',
    'language = "en"',
    'src = "src"',
    '',
  ].join('\n');
}

export function renderSummary(pages: readonly DocPage[] = DOC_PAGES): string {
  const lines = ['# Summary', ''];
  for (const section of DOC_SECTIONS) {
    lines.push(`# ${section.title}`);
    for (const page of pagesInSection(section.id).filter((p) => pages.some((x) => x.id === p.id))) {
      lines.push(`- [${page.title}](${bookDest(page)})`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Paths and bodies for an mdbook tree. `readSource` loads each catalog
 * markdown file from the repository so the book stays a straight copy.
 */
export function planBookFiles(readSource: (source: string) => string): BookFile[] {
  if (typeof readSource !== 'function') throw new Error('readSource must be a function');
  const files: BookFile[] = [
    { path: `${BOOK_ROOT}/book.toml`, contents: renderBookToml() },
    { path: `${BOOK_SRC}/SUMMARY.md`, contents: renderSummary() },
  ];
  for (const page of DOC_PAGES) {
    files.push({ path: `${BOOK_SRC}/${bookDest(page)}`, contents: readSource(page.source) });
  }
  return files;
}

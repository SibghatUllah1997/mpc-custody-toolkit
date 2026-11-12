/**
 * Render API reference tables from a flat list of exported symbols.
 *
 * Extraction (walking the TypeScript program) lives outside the runtime
 * package so the toolkit never depends on the compiler; this module only
 * turns already-collected entries into stable markdown.
 */

export type ApiKind = 'function' | 'const' | 'type' | 'interface' | 'class' | 'enum';

export type ApiEntry = {
  /** Namespace on the root export (e.g. `Shamir`), or `''` for root-level names. */
  namespace: string;
  name: string;
  kind: ApiKind;
  /** One-line signature or declaration, already flattened. */
  signature: string;
  /** First sentence of the doc comment, if any. */
  summary?: string;
};

const KINDS: readonly ApiKind[] = ['function', 'const', 'type', 'interface', 'class', 'enum'];
const ROOT_TITLE = 'Root exports';
export const MAX_SIGNATURE_LENGTH = 160;

/** Collapse whitespace and cap length so a table row stays on one line. */
export function flattenSignature(text: string, max = MAX_SIGNATURE_LENGTH): string {
  if (typeof text !== 'string') throw new Error('signature must be a string');
  if (!Number.isInteger(max) || max < 8) throw new Error('max must be an integer >= 8');
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** Escape a value for a GitHub/mdbook table cell. */
export function escapeCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** First sentence (up to the first `. ` or line break) of a doc comment. */
export function firstSentence(doc: string | undefined): string {
  if (!doc) return '';
  const text = doc.replace(/\s+/g, ' ').trim();
  const m = text.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : text).trim();
}

function validateEntry(e: ApiEntry, i: number): void {
  if (!e || typeof e !== 'object') throw new Error(`entry ${i} must be an object`);
  if (typeof e.namespace !== 'string') throw new Error(`entry ${i}: namespace must be a string`);
  if (typeof e.name !== 'string' || e.name === '') throw new Error(`entry ${i}: name is required`);
  if (!KINDS.includes(e.kind)) throw new Error(`entry ${i} (${e.name}): unknown kind ${String(e.kind)}`);
  if (typeof e.signature !== 'string') throw new Error(`entry ${i} (${e.name}): signature must be a string`);
}

/** Group entries by namespace (root first, then alphabetical) and sort names inside each. */
export function groupApiEntries(entries: readonly ApiEntry[]): Array<{ namespace: string; entries: ApiEntry[] }> {
  if (!Array.isArray(entries)) throw new Error('entries must be an array');
  const seen = new Set<string>();
  const groups = new Map<string, ApiEntry[]>();
  entries.forEach((e, i) => {
    validateEntry(e, i);
    const key = `${e.namespace}.${e.name}`;
    if (seen.has(key)) throw new Error(`duplicate api entry: ${key}`);
    seen.add(key);
    const list = groups.get(e.namespace) ?? [];
    list.push(e);
    groups.set(e.namespace, list);
  });
  const names = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  return names.map((namespace) => ({
    namespace,
    entries: groups.get(namespace)!.slice().sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

function anchor(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Full markdown page: an index of namespaces, then one table per namespace. */
export function renderApiReference(entries: readonly ApiEntry[]): string {
  const groups = groupApiEntries(entries);
  const lines: string[] = [
    '# API reference',
    '',
    '<!-- Generated from src/index.ts by `npm run docs:api`. Do not edit by hand. -->',
    '',
    'Everything below is reachable from the package root, e.g.',
    '`import { Shamir } from \'mpc-custody-toolkit\'` then `Shamir.splitSecret(...)`.',
    '',
    '| Namespace | Exports |',
    '| --- | --- |',
  ];
  for (const g of groups) {
    const title = g.namespace || ROOT_TITLE;
    lines.push(`| [${title}](#${anchor(title)}) | ${g.entries.length} |`);
  }
  for (const g of groups) {
    const title = g.namespace || ROOT_TITLE;
    lines.push('', `## ${title}`, '', '| Name | Kind | Signature | Summary |', '| --- | --- | --- | --- |');
    for (const e of g.entries) {
      const sig = flattenSignature(e.signature);
      const cells = [
        `\`${e.name}\``,
        e.kind,
        sig ? `\`${escapeCell(sig)}\`` : '',
        escapeCell(firstSentence(e.summary)),
      ];
      lines.push(`| ${cells.join(' | ')} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

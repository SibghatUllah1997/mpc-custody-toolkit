import { describe, expect, it } from 'vitest';
import { Docs } from '../src';

const entries: Docs.ApiEntry[] = [
  { namespace: 'Shamir', name: 'splitSecret', kind: 'function', signature: '(secret: Uint8Array, t: number, n: number) => Share[]', summary: 'Split a key. Extra detail.' },
  { namespace: '', name: 'encodeShare', kind: 'function', signature: '(share: Share) => string' },
  { namespace: 'Shamir', name: 'Share', kind: 'type', signature: '{ x: number; y: string }' },
  { namespace: 'Bench', name: 'Mode', kind: 'type', signature: "'a' | 'b'" },
];

describe('api reference tables', () => {
  it('puts root exports first and sorts namespaces and names', () => {
    const groups = Docs.groupApiEntries(entries);
    expect(groups.map((g) => g.namespace)).toEqual(['', 'Bench', 'Shamir']);
    expect(groups[2].entries.map((e) => e.name)).toEqual(['Share', 'splitSecret']);
  });

  it('renders an index plus one table per namespace', () => {
    const md = Docs.renderApiReference(entries);
    expect(md.startsWith('# API reference\n')).toBe(true);
    expect(md).toContain('| [Root exports](#root-exports) | 1 |');
    expect(md).toContain('## Shamir');
    expect(md).toContain('| `splitSecret` | function | `(secret: Uint8Array, t: number, n: number) => Share[]` | Split a key. |');
    expect(md).toContain("| `Mode` | type | `'a' \\| 'b'` |  |");
  });

  it('is independent of input order', () => {
    expect(Docs.renderApiReference([...entries].reverse())).toBe(Docs.renderApiReference(entries));
  });

  it('flattens and caps long signatures', () => {
    expect(Docs.flattenSignature('{\n  a: 1;\n  b: 2\n}')).toBe('{ a: 1; b: 2 }');
    const long = Docs.flattenSignature('x'.repeat(500), 20);
    expect(long).toHaveLength(20);
    expect(long.endsWith('…')).toBe(true);
    expect(() => Docs.flattenSignature('a', 3)).toThrow(/max must be/);
  });

  it('takes only the first sentence of a summary', () => {
    expect(Docs.firstSentence('Does a thing. Then more.')).toBe('Does a thing.');
    expect(Docs.firstSentence('No period here')).toBe('No period here');
    expect(Docs.firstSentence(undefined)).toBe('');
  });

  it('rejects duplicates and malformed entries', () => {
    expect(() => Docs.groupApiEntries([entries[0], entries[0]])).toThrow(/duplicate api entry: Shamir.splitSecret/);
    expect(() => Docs.groupApiEntries([{ ...entries[0], kind: 'macro' as Docs.ApiKind }])).toThrow(/unknown kind macro/);
    expect(() => Docs.groupApiEntries([{ ...entries[0], name: '' }])).toThrow(/name is required/);
    expect(() => Docs.groupApiEntries('x' as unknown as Docs.ApiEntry[])).toThrow(/entries must be an array/);
  });
});

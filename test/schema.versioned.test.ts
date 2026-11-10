import { describe, it, expect } from 'vitest';
import {
  assertSchemaSpec,
  parseDocument,
  readHeader,
  SchemaError,
  upgradeDocument,
  type SchemaSpec,
} from '../src/schema';

const spec: SchemaSpec = {
  type: 'demo',
  label: 'demo doc',
  minVersion: 1,
  currentVersion: 3,
  migrations: {
    1: (d) => ({ ...d, name: String(d.title ?? ''), title: undefined }),
    2: (d) => ({ ...d, tags: [] }),
  },
};

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof SchemaError ? e.code : 'other';
  }
  return undefined;
}

describe('versioned documents', () => {
  it('parses objects only', () => {
    expect(parseDocument('{"a":1}')).toEqual({ a: 1 });
    expect(codeOf(() => parseDocument('nope'))).toBe('invalid-json');
    expect(codeOf(() => parseDocument('[1]'))).toBe('not-an-object');
    expect(codeOf(() => parseDocument('null'))).toBe('not-an-object');
  });

  it('reads and checks the header', () => {
    expect(readHeader({ type: 'demo', version: 2 })).toEqual({ type: 'demo', version: 2 });
    expect(codeOf(() => readHeader({ version: 1 }))).toBe('unknown-type');
    expect(codeOf(() => readHeader({ type: 'demo', version: 0 }))).toBe('missing-version');
    expect(codeOf(() => readHeader({ type: 'demo', version: 1.5 }))).toBe('missing-version');
    expect(codeOf(() => readHeader({ type: 'demo', version: '1' }))).toBe('missing-version');
  });

  it('runs every migration step in order and stamps the new version', () => {
    const { doc, sourceVersion } = upgradeDocument({ type: 'demo', version: 1, title: 'x' }, spec);
    expect(sourceVersion).toBe(1);
    expect(doc).toMatchObject({ type: 'demo', version: 3, name: 'x', tags: [] });
  });

  it('leaves current documents untouched', () => {
    const input = { type: 'demo', version: 3, name: 'y', tags: ['a'] };
    const { doc, sourceVersion } = upgradeDocument(input, spec);
    expect(sourceVersion).toBe(3);
    expect(doc).toBe(input);
  });

  it('separates newer, too-old, and wrong-type documents', () => {
    expect(codeOf(() => upgradeDocument({ type: 'demo', version: 4 }, spec))).toBe('newer-version');
    expect(() => upgradeDocument({ type: 'demo', version: 4 }, spec)).toThrow(/newer toolkit/);
    const strict = { ...spec, minVersion: 2 };
    expect(codeOf(() => upgradeDocument({ type: 'demo', version: 1 }, strict))).toBe('unsupported-version');
    expect(codeOf(() => upgradeDocument({ type: 'other', version: 1 }, spec))).toBe('unknown-type');
  });

  it('flags specs with a gap in the migration chain', () => {
    expect(() => assertSchemaSpec(spec)).not.toThrow();
    expect(() => assertSchemaSpec({ ...spec, migrations: { 1: spec.migrations[1] } })).toThrow(/v2 to v3/);
    expect(() => assertSchemaSpec({ ...spec, currentVersion: 0 })).toThrow();
  });
});

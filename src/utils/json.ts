/**
 * Deterministic JSON stringify: sorts object keys lexicographically and
 * stringifies arrays and primitives as-is. Produces a stable representation
 * suitable for checksums and signatures.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t !== 'object') return value;
  if (Array.isArray(value)) return value.map(normalize);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) out[k] = normalize(obj[k]);
  return out;
}


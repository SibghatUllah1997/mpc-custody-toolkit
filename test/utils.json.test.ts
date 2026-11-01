import { describe, it, expect } from 'vitest';
import { stableStringify } from '../src/utils/json';

describe('stableStringify', () => {
  it('orders object keys lexicographically and is stable', () => {
    const a = { b: 1, a: 2, c: { z: 3, y: 4 } };
    const b = { c: { y: 4, z: 3 }, a: 2, b: 1 };
    const sa = stableStringify(a);
    const sb = stableStringify(b);
    expect(sa).toBe(sb);
    expect(sa).toBe('{"a":2,"b":1,"c":{"y":4,"z":3}}');
  });
  it('keeps array order and normalizes nested structures', () => {
    const v = [{ z: 1, y: 2 }, { b: 3, a: 4 }];
    expect(stableStringify(v)).toBe('[{"y":2,"z":1},{"a":4,"b":3}]');
  });
});


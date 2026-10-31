import { describe, it, expect } from 'vitest';
import { bytesToHex, hexToBytes, normalizeHex, strip0x } from '../src/utils/bytes';

describe('hex/bytes utilities', () => {
  it('roundtrips bytes <-> hex', () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x2a, 0xff]);
    const hex = bytesToHex(bytes);
    expect(hex).toBe('00012aff');
    const back = hexToBytes(hex);
    expect(Buffer.from(back)).toEqual(Buffer.from(bytes));
  });

  it('accepts 0x-prefixed hex and enforces even length', () => {
    expect(normalizeHex('0xA0b1')).toBe('a0b1');
    expect(() => normalizeHex('abc')).toThrow(); // odd length
    expect(() => normalizeHex('zz')).toThrow(); // non-hex
  });

  it('enforces expected length when provided', () => {
    const two = hexToBytes('0x1234', 2);
    expect(two.length).toBe(2);
    expect(() => hexToBytes('1234', 4)).toThrow();
  });

  it('strip0x removes both 0x and 0X', () => {
    expect(strip0x('0x12')).toBe('12');
    expect(strip0x('0X12')).toBe('12');
    expect(strip0x('12')).toBe('12');
  });
});


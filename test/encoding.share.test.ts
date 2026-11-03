import { describe, it, expect } from 'vitest';
import { Shamir, Secp256k1 } from '../src';
import { ShareEncoding } from '../src/encoding/share';

describe('share encoding (JSON + checksum)', () => {
  it('roundtrips a Shamir share via encode/decode', () => {
    const secret = Secp256k1.generatePrivateKey();
    const shares = Shamir.splitSecret(secret, 2, 3);
    for (const s of shares) {
      const json = ShareEncoding.encodeShare(s);
      const back = ShareEncoding.decodeShare(json);
      expect(back.x).toBe(s.x);
      expect(Buffer.from(back.y)).toEqual(Buffer.from(s.y));
    }
  });

  it('rejects tampered data via checksum mismatch', () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s] = Shamir.splitSecret(secret, 2, 2);
    const json = ShareEncoding.encodeShare(s);
    const obj = JSON.parse(json);
    // Flip one nibble
    const orig = obj.data.y as string;
    const flipped = (orig[0] === '0' ? '1' : '0') + orig.slice(1);
    obj.data.y = flipped;
    const tampered = JSON.stringify(obj);
    expect(() => ShareEncoding.decodeShare(tampered)).toThrow();
  });

  it('embeds a verifiable HMAC-SHA256 mac on encode', () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s] = Shamir.splitSecret(secret, 2, 2);
    const obj = JSON.parse(ShareEncoding.encodeShare(s));
    expect(obj.mac.algo).toBe(ShareEncoding.SHARE_MAC_ALGO);
    expect(obj.mac.hex).toBe(ShareEncoding.computeShareMacHex(obj.data));
    expect(obj.mac.hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a tampered mac field', () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s] = Shamir.splitSecret(secret, 2, 2);
    const obj = JSON.parse(ShareEncoding.encodeShare(s));
    const orig = obj.mac.hex as string;
    obj.mac.hex = (orig[0] === '0' ? '1' : '0') + orig.slice(1);
    expect(() => ShareEncoding.decodeShare(JSON.stringify(obj))).toThrow(/mac mismatch/);
  });

  it('still accepts legacy checksum-only backups without a mac', () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s] = Shamir.splitSecret(secret, 2, 2);
    const obj = JSON.parse(ShareEncoding.encodeShare(s));
    delete obj.mac;
    const back = ShareEncoding.decodeShare(JSON.stringify(obj));
    expect(back.x).toBe(s.x);
    expect(Buffer.from(back.y)).toEqual(Buffer.from(s.y));
  });
});


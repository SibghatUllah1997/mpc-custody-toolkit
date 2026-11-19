import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PATH,
  deriveFromMnemonic,
  deriveFromSeed,
  derivedKeyToHex,
  generateMnemonic,
  isValidMnemonic,
  mnemonicToSeed,
  normalizeMnemonic,
  parsePath,
} from '../src/hd';
import { getPublicKeyCompressed } from '../src/crypto/secp256k1';
import { bytesToHex, hexToBytes } from '../src/utils/bytes';

const ABANDON = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Widely used public development mnemonic; never holds real funds.
// Salt word from the published BIP-39 reference vectors.
const BIP39_VECTOR_WORD = 'TREZOR';
const DEV = 'test test test test test test test test test test test junk';

describe('BIP-39 mnemonics', () => {
  it('matches the reference seed vector (salt word TREZOR)', () => {
    expect(bytesToHex(mnemonicToSeed(ABANDON, BIP39_VECTOR_WORD))).toBe(
      'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04'
    );
  });

  it('generates valid 12- and 24-word mnemonics that differ each call', () => {
    const a = generateMnemonic();
    const b = generateMnemonic(12);
    expect(a.split(' ')).toHaveLength(24);
    expect(b.split(' ')).toHaveLength(12);
    expect(isValidMnemonic(a)).toBe(true);
    expect(isValidMnemonic(b)).toBe(true);
    expect(generateMnemonic()).not.toBe(a);
    expect(() => generateMnemonic(18 as never)).toThrow(/12 or 24 words/);
  });

  it('normalizes spacing and case before validating', () => {
    const messy = `  ${ABANDON.toUpperCase().replace(/ /g, '   ')}\n`;
    expect(normalizeMnemonic(messy)).toBe(ABANDON);
    expect(bytesToHex(mnemonicToSeed(messy))).toBe(bytesToHex(mnemonicToSeed(ABANDON)));
  });

  it('rejects bad checksums, unknown words, and wrong lengths', () => {
    const badChecksum = ABANDON.replace(/about$/, 'abandon');
    expect(isValidMnemonic(badChecksum)).toBe(false);
    expect(() => mnemonicToSeed(badChecksum)).toThrow(/bad checksum/);
    expect(() => mnemonicToSeed(ABANDON.replace(/about$/, 'zzzz'))).toThrow(/unknown word/);
    expect(() => mnemonicToSeed('abandon about')).toThrow(/12 or 24 words, got 2/);
    expect(() => mnemonicToSeed('')).toThrow(/got 0/);
    expect(() => mnemonicToSeed(ABANDON, 5 as never)).toThrow(/passphrase must be a string/);
    expect(isValidMnemonic(7 as never)).toBe(false);
  });
});

describe('BIP-32 derivation', () => {
  it('matches BIP-32 test vector 1 at m/0H/1/2H/2/1000000000', () => {
    const seed = hexToBytes('000102030405060708090a0b0c0d0e0f');
    const key = derivedKeyToHex(deriveFromSeed(seed, "m/0'/1/2'/2/1000000000"));
    expect(key.masterFingerprint).toBe('3442193e');
    expect(key.privateKey).toBe('471b76e389e528d6de6d816857e012c5455051cad6660850e58372a6c3e6e7c8');
    expect(key.publicKey).toBe('022a471424da5e657499d1ff51cb43c47481a03b1e77f951fe64cec9f5a48f7011');
    expect(key.xpub).toBe(
      'xpub6H1LXWLaKsWFhvm6RVpEL9P4KfRZSW7abD2ttkWP3SSQvnyA8FSVqNTEcYFgJS2UaFcxupHiYkro49S8yGasTvXEYBVPamhGW6cFJodrTHy'
    );
  });

  it('derives the well-known first Ethereum dev key at the default path', () => {
    const key = deriveFromMnemonic({ mnemonic: DEV });
    expect(key.path).toBe(DEFAULT_PATH);
    expect(bytesToHex(key.privateKey)).toBe('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    expect(bytesToHex(key.publicKey)).toBe(bytesToHex(getPublicKeyCompressed(key.privateKey)));
  });

  it('mixes in the salt word and accepts h for hardened steps', () => {
    const salted = deriveFromSeed(mnemonicToSeed(ABANDON, BIP39_VECTOR_WORD), 'm/44h/0h/0h/0/7');
    expect(salted.path).toBe("m/44'/0'/0'/0/7");
    expect(bytesToHex(salted.publicKey)).toBe(
      '024d33ba1fcca102256f79b9b595eca848a4c3e2f405347dd2d63560e739518722'
    );
    const plain = deriveFromMnemonic({ mnemonic: ABANDON, path: 'm/44h/0h/0h/0/7' });
    expect(bytesToHex(plain.publicKey)).not.toBe(bytesToHex(salted.publicKey));
  });

  it('rejects short seeds and bad options', () => {
    expect(() => deriveFromSeed(new Uint8Array(8))).toThrow(/16 to 64 bytes/);
    expect(() => deriveFromMnemonic(null as never)).toThrow(/must be an object/);
  });
});

describe('parsePath', () => {
  it('returns indexes with the hardened offset and a canonical string', () => {
    expect(parsePath("m/44'/60H/0h/1/2")).toEqual({
      indexes: [0x8000002c, 0x8000003c, 0x80000000, 1, 2],
      canonical: "m/44'/60'/0'/1/2",
    });
    expect(parsePath('m')).toEqual({ indexes: [], canonical: 'm' });
  });

  it.each([
    ['', /required/],
    ['44/0', /start with "m"/],
    ['M/0', /start with "m"/],
    ['m/', /invalid path segment ""/],
    ['m/01', /invalid path segment "01"/],
    ['m/-1', /invalid path segment/],
    ["m/0''", /invalid path segment/],
    ['m/2147483648', /below 2\^31/],
  ])('rejects %j', (path, err) => {
    expect(() => parsePath(path)).toThrow(err);
  });

  it('caps depth at 255', () => {
    expect(() => parsePath(`m${'/0'.repeat(256)}`)).toThrow(/deeper than 255/);
  });
});

import { describe, expect, it } from 'vitest';
import { readSecretLine, runKeygen } from '../src/cli';
import { combineShares, splitSecret } from '../src/sss/shamir';
import { bytesToHex } from '../src/utils/bytes';
import { isValidMnemonic } from '../src/hd';
import { explainError } from '../src/ux/errors';

const EXTRA_WORDS = 'extra words';
const DEV = 'test test test test test test test test test test test junk';

describe('CLI runKeygen', () => {
  it('keeps the plain random keygen output unchanged', () => {
    const out = runKeygen();
    expect(Object.keys(out).sort()).toEqual(['privateKey', 'publicKey']);
    expect(out.privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(out.publicKey).toMatch(/^0[23][0-9a-f]{64}$/);
  });

  it('creates a new 24-word mnemonic by default and returns it once', () => {
    const out = runKeygen({ newMnemonic: true });
    expect(out.mnemonic?.split(' ')).toHaveLength(24);
    expect(isValidMnemonic(out.mnemonic as string)).toBe(true);
    expect(out.path).toBe("m/44'/60'/0'/0/0");
    expect(out.xpub).toMatch(/^xpub/);
    // The same words restore the same key without echoing the mnemonic back.
    const restored = runKeygen({ mnemonic: out.mnemonic });
    expect(restored.privateKey).toBe(out.privateKey);
    expect(restored.mnemonic).toBeUndefined();
  });

  it('restores from saved words with a custom path and a passphrase', () => {
    const base = runKeygen({ mnemonic: `${DEV}\n` });
    expect(base.privateKey).toBe('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
    const second = runKeygen({ mnemonic: DEV, path: "m/44'/60'/0'/0/1" });
    expect(second.privateKey).not.toBe(base.privateKey);
    const withPass = runKeygen({ mnemonic: DEV, passphrase: EXTRA_WORDS });
    expect(withPass.privateKey).not.toBe(base.privateKey);
    expect(withPass.masterFingerprint).not.toBe(base.masterFingerprint);
  });

  it('feeds a derived key into a Shamir split and back', () => {
    const { privateKey } = runKeygen({ mnemonic: DEV });
    const shares = splitSecret(privateKey, 2, 3);
    expect(bytesToHex(combineShares([shares[0], shares[2]]))).toBe(privateKey);
  });

  it('accepts 12 words and rejects other lengths or mixed modes', () => {
    expect(runKeygen({ newMnemonic: true, words: 12 }).mnemonic?.split(' ')).toHaveLength(12);
    expect(() => runKeygen({ newMnemonic: true, words: 18 })).toThrow(/12 or 24/);
    expect(() => runKeygen({ mnemonic: DEV, words: 12 })).toThrow(/only applies with --new-mnemonic/);
    expect(() => runKeygen({ newMnemonic: true, mnemonic: DEV })).toThrow(/not both/);
    expect(() => runKeygen({ path: 'm/0' })).toThrow(/need --new-mnemonic or --mnemonic-file/);
    expect(() => runKeygen({ mnemonic: DEV.replace(/junk$/, 'test') })).toThrow(/bad checksum/);
    expect(() => runKeygen({ mnemonic: DEV, path: 'x/0' })).toThrow(/start with "m"/);
  });

  it('gives a hint for a bad checksum', () => {
    try {
      runKeygen({ mnemonic: DEV.replace(/junk$/, 'test') });
      throw new Error('expected failure');
    } catch (err) {
      expect(explainError(err).hint).toMatch(/BIP-39 English list/);
    }
  });
});

describe('readSecretLine', () => {
  it('drops exactly one trailing newline and keeps inner spaces', () => {
    expect(readSecretLine('two words\n')).toBe('two words');
    expect(readSecretLine('pass\r\n')).toBe('pass');
    expect(readSecretLine(' spaced \n\n')).toBe(' spaced \n');
    expect(readSecretLine('plain')).toBe('plain');
  });
});

import { HDKey } from '@scure/bip32';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';
import { InputError } from '../errors/input.js';
import { bytesToHex } from '../utils/bytes.js';
import { DEFAULT_PATH, parsePath } from './path.js';
import type { DeriveOptions, DerivedKey, MnemonicWords } from './types.js';

const STRENGTH: Record<MnemonicWords, number> = { 12: 128, 24: 256 };

/** Words separated by single spaces, NFKD-normalized, lower case. */
export function normalizeMnemonic(mnemonic: string): string {
  if (typeof mnemonic !== 'string') {
    throw new InputError('invalid-type', 'mnemonic must be a string', 'mnemonic');
  }
  return mnemonic.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
}

/** A new English BIP-39 mnemonic from the platform CSPRNG. Defaults to 24 words. */
export function generateMnemonic(words: MnemonicWords = 24): string {
  const strength = STRENGTH[words];
  if (strength === undefined) {
    throw new InputError('invalid-range', 'mnemonic length must be 12 or 24 words', 'words');
  }
  return bip39.generateMnemonic(wordlist, strength);
}

/** True when every word is in the English list and the checksum matches. */
export function isValidMnemonic(mnemonic: string): boolean {
  try {
    return bip39.validateMnemonic(normalizeMnemonic(mnemonic), wordlist);
  } catch {
    return false;
  }
}

function assertMnemonic(mnemonic: string): string {
  const normalized = normalizeMnemonic(mnemonic);
  const count = normalized === '' ? 0 : normalized.split(' ').length;
  if (count !== 12 && count !== 24) {
    throw new InputError('invalid-length', `mnemonic must have 12 or 24 words, got ${count}`, 'mnemonic');
  }
  if (!bip39.validateMnemonic(normalized, wordlist)) {
    throw new InputError(
      'mismatch',
      'mnemonic has an unknown word or a bad checksum',
      'mnemonic'
    );
  }
  return normalized;
}

/** 64-byte BIP-39 seed (PBKDF2-HMAC-SHA512, 2048 rounds) after validating the mnemonic. */
export function mnemonicToSeed(mnemonic: string, passphrase = ''): Uint8Array {
  if (typeof passphrase !== 'string') {
    throw new InputError('invalid-type', 'passphrase must be a string', 'passphrase');
  }
  return bip39.mnemonicToSeedSync(assertMnemonic(mnemonic), passphrase);
}

function fingerprintHex(n: number): string {
  return n.toString(16).padStart(8, '0');
}

/** Derive one BIP-32 node from a 64-byte (or 16..64-byte) seed. */
export function deriveFromSeed(seed: Uint8Array, path: string = DEFAULT_PATH): DerivedKey {
  if (!(seed instanceof Uint8Array) || seed.length < 16 || seed.length > 64) {
    throw new InputError('invalid-length', 'seed must be 16 to 64 bytes', 'seed');
  }
  const { canonical } = parsePath(path);
  const master = HDKey.fromMasterSeed(seed);
  const node = master.derive(canonical);
  if (!node.privateKey || !node.publicKey) {
    throw new Error('derivation did not produce a private key');
  }
  return {
    path: canonical,
    privateKey: node.privateKey,
    publicKey: node.publicKey,
    xpub: node.publicExtendedKey,
    masterFingerprint: fingerprintHex(master.fingerprint),
  };
}

/** Mnemonic (+ optional passphrase) → seed → BIP-32 key at `path`. */
export function deriveFromMnemonic(opts: DeriveOptions): DerivedKey {
  if (!opts || typeof opts !== 'object') {
    throw new InputError('invalid-type', 'derive options must be an object', 'mnemonic');
  }
  const seed = mnemonicToSeed(opts.mnemonic, opts.passphrase ?? '');
  try {
    return deriveFromSeed(seed, opts.path ?? DEFAULT_PATH);
  } finally {
    seed.fill(0);
  }
}

/** Hex view of a derived key for CLI and JSON output. */
export function derivedKeyToHex(key: DerivedKey): {
  path: string;
  privateKey: string;
  publicKey: string;
  xpub: string;
  masterFingerprint: string;
} {
  return {
    path: key.path,
    privateKey: bytesToHex(key.privateKey),
    publicKey: bytesToHex(key.publicKey),
    xpub: key.xpub,
    masterFingerprint: key.masterFingerprint,
  };
}

/** BIP-39 English mnemonics of 12 or 24 words (128 or 256 bits of entropy). */
export type MnemonicWords = 12 | 24;

export type DeriveOptions = {
  mnemonic: string;
  /** Optional BIP-39 passphrase ("25th word"). Empty string when absent. */
  passphrase?: string;
  /** BIP-32 path such as `m/44'/60'/0'/0/0`. Defaults to `DEFAULT_PATH`. */
  path?: string;
};

export type DerivedKey = {
  path: string;
  /** 32-byte secp256k1 private key. */
  privateKey: Uint8Array;
  /** 33-byte compressed public key. */
  publicKey: Uint8Array;
  /** Extended public key (xpub) of the derived node; safe to share for watch-only use. */
  xpub: string;
  /** First 4 bytes of HASH160 of the master public key, as 8 hex chars. */
  masterFingerprint: string;
};

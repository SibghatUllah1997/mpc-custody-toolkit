/** One backup in a recovery dry-run: public facts only, never the share y. */
export type RecoveryShareNote = {
  x: number;
  encrypted: boolean;
  sourceVersion: number;
  path?: string;
};

/**
 * Result of checking backups without revealing the reconstructed scalar.
 * `publicKey` is the compressed secp256k1 key of the combined secret.
 */
export type RecoveryDryRunReport = {
  ok: true;
  shareCount: number;
  usedShareXs: number[];
  threshold: number;
  total?: number;
  setId?: string;
  encryptedCount: number;
  publicKey: string;
  shares: RecoveryShareNote[];
};

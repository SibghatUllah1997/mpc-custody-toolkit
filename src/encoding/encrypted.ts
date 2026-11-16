import { argon2idAsync } from '@noble/hashes/argon2';
import { randomBytes, createCipheriv, createDecipheriv, scrypt as _scrypt, type ScryptOptions } from 'crypto';
import { bytesToHex, hexToBytes } from '../utils/bytes.js';

function scrypt(password: string, salt: Uint8Array, keyLen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    _scrypt(password, salt, keyLen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/**
 * Default Argon2id parameters for new encrypted share backups.
 *
 * t=2, m=19456 KiB (19 MiB), p=1 follows the OWASP Argon2id recommendation.
 * The values are written into every envelope so a later toolkit can still
 * open the file if these defaults change. version 0x13 is Argon2 v1.3.
 */
export const ARGON2ID_PARAMS = {
  t: 2,
  m: 19_456,
  p: 1,
  version: 0x13,
  keyLen: 32,
  saltLen: 16,
} as const;

/** Caps applied when opening a file, so a crafted envelope cannot exhaust memory. */
export const DECRYPT_LIMITS = {
  argon2: { minT: 1, maxT: 16, minM: 8, maxM: 256 * 1024, minP: 1, maxP: 16 },
  scrypt: { maxN: 1 << 20, maxR: 32, maxP: 16 },
} as const;

export type EncryptedEnvelopeV1 = {
  version: 1;
  type: 'encrypted';
  kdf: {
    name: 'scrypt';
    N: number;
    r: number;
    p: number;
    salt: string; // hex
    keyLen: number; // bytes
  };
  cipher: {
    name: 'aes-256-gcm';
    iv: string; // hex
    tag: string; // hex
  };
  ciphertext: string; // hex
};

export type EncryptedEnvelopeV2 = {
  version: 2;
  type: 'encrypted';
  kdf: {
    name: 'argon2id';
    t: number;
    m: number;
    p: number;
    version: number;
    salt: string; // hex
    keyLen: number; // bytes
  };
  cipher: {
    name: 'aes-256-gcm';
    iv: string; // hex
    tag: string; // hex
  };
  ciphertext: string; // hex
};

export type EncryptedEnvelope = EncryptedEnvelopeV1 | EncryptedEnvelopeV2;

function requirePassword(password: string): void {
  if (typeof password !== 'string' || password.length === 0) throw new Error('password is required');
}

function aesGcmEncrypt(key: Uint8Array, plaintext: string): { iv: Buffer; tag: Buffer; ciphertext: Buffer } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ciphertext };
}

function aesGcmDecrypt(key: Uint8Array, iv: Uint8Array, tag: Uint8Array, ciphertext: Uint8Array): string {
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(iv));
  decipher.setAuthTag(Buffer.from(tag));
  const pt = Buffer.concat([decipher.update(Buffer.from(ciphertext)), decipher.final()]);
  return pt.toString('utf8');
}

export async function encryptString(plaintext: string, password: string): Promise<string> {
  if (typeof plaintext !== 'string') throw new Error('plaintext must be a string');
  requirePassword(password);
  const { t, m, p, version, keyLen, saltLen } = ARGON2ID_PARAMS;
  const salt = randomBytes(saltLen);
  const key = await argon2idAsync(password, salt, { t, m, p, version, dkLen: keyLen });
  const { iv, tag, ciphertext } = aesGcmEncrypt(key, plaintext);
  const envelope: EncryptedEnvelopeV2 = {
    version: 2,
    type: 'encrypted',
    kdf: {
      name: 'argon2id',
      t,
      m,
      p,
      version,
      salt: bytesToHex(salt),
      keyLen,
    },
    cipher: {
      name: 'aes-256-gcm',
      iv: bytesToHex(iv),
      tag: bytesToHex(tag),
    },
    ciphertext: bytesToHex(ciphertext),
  };
  return JSON.stringify(envelope, null, 2);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function asPositiveInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function inRange(value: number, min: number, max: number, label: string): number {
  if (value < min || value > max) throw new Error(`${label} out of range`);
  return value;
}

async function deriveKeyV1(kdf: Record<string, unknown>, password: string): Promise<Uint8Array> {
  if (kdf.name !== 'scrypt') throw new Error('unsupported kdf');
  const N = asPositiveInt(kdf.N, 'kdf.N');
  const r = asPositiveInt(kdf.r, 'kdf.r');
  const p = asPositiveInt(kdf.p, 'kdf.p');
  const keyLen = asPositiveInt(kdf.keyLen, 'kdf.keyLen');
  if (N > DECRYPT_LIMITS.scrypt.maxN || r > DECRYPT_LIMITS.scrypt.maxR || p > DECRYPT_LIMITS.scrypt.maxP) {
    throw new Error('scrypt parameters out of range');
  }
  if (keyLen !== 32) throw new Error('unsupported key length');
  if (typeof kdf.salt !== 'string') throw new Error('kdf.salt must be hex');
  const salt = hexToBytes(kdf.salt, 16);
  return (await scrypt(password, salt, keyLen, { N, r, p })) as Buffer;
}

async function deriveKeyV2(kdf: Record<string, unknown>, password: string): Promise<Uint8Array> {
  if (kdf.name !== 'argon2id') throw new Error('unsupported kdf');
  const t = inRange(asPositiveInt(kdf.t, 'kdf.t'), DECRYPT_LIMITS.argon2.minT, DECRYPT_LIMITS.argon2.maxT, 'kdf.t');
  const m = inRange(asPositiveInt(kdf.m, 'kdf.m'), DECRYPT_LIMITS.argon2.minM, DECRYPT_LIMITS.argon2.maxM, 'kdf.m');
  const p = inRange(asPositiveInt(kdf.p, 'kdf.p'), DECRYPT_LIMITS.argon2.minP, DECRYPT_LIMITS.argon2.maxP, 'kdf.p');
  const keyLen = asPositiveInt(kdf.keyLen, 'kdf.keyLen');
  if (keyLen !== 32) throw new Error('unsupported key length');
  const version = typeof kdf.version === 'number' ? kdf.version : 0x13;
  if (version !== 0x10 && version !== 0x13) throw new Error('unsupported argon2 version');
  if (typeof kdf.salt !== 'string') throw new Error('kdf.salt must be hex');
  const salt = hexToBytes(kdf.salt, 16);
  return argon2idAsync(password, salt, { t, m, p, version, dkLen: keyLen });
}

export async function decryptToString(json: string, password: string): Promise<string> {
  let env: unknown;
  try {
    env = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }
  const e = asObject(env, 'envelope');
  if (e.type !== 'encrypted' || (e.version !== 1 && e.version !== 2)) {
    throw new Error('unsupported encrypted envelope');
  }
  requirePassword(password);
  const kdf = asObject(e.kdf, 'kdf');
  const cipher = asObject(e.cipher, 'cipher');
  if (cipher.name !== 'aes-256-gcm') throw new Error('unsupported cipher');
  if (typeof cipher.iv !== 'string' || typeof cipher.tag !== 'string') throw new Error('cipher fields must be hex');
  if (typeof e.ciphertext !== 'string') throw new Error('ciphertext must be hex');
  const key = e.version === 1 ? await deriveKeyV1(kdf, password) : await deriveKeyV2(kdf, password);
  const iv = hexToBytes(cipher.iv, 12);
  const tag = hexToBytes(cipher.tag, 16);
  const ct = hexToBytes(e.ciphertext);
  try {
    return aesGcmDecrypt(key, iv, tag, ct);
  } catch {
    throw new Error('decryption failed');
  }
}

export function isEncryptedEnvelope(json: string): boolean {
  try {
    const obj = JSON.parse(json) as { type?: unknown; version?: unknown };
    return Boolean(obj && typeof obj === 'object' && obj.type === 'encrypted' && (obj.version === 1 || obj.version === 2));
  } catch {
    return false;
  }
}

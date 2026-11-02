import { randomBytes, createCipheriv, createDecipheriv, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import { bytesToHex, hexToBytes } from '../utils/bytes.js';

const scrypt = promisify(_scrypt);

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

export async function encryptString(plaintext: string, password: string): Promise<string> {
  if (typeof plaintext !== 'string') throw new Error('plaintext must be a string');
  if (typeof password !== 'string' || password.length === 0) throw new Error('password is required');
  // Parameters chosen for balance between speed and security in test environments.
  const N = 1 << 14; // 16384
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const keyLen = 32;
  const key = (await scrypt(password, salt, keyLen, { N, r, p })) as Buffer;
  const iv = randomBytes(12); // GCM nonce
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope: EncryptedEnvelopeV1 = {
    version: 1,
    type: 'encrypted',
    kdf: {
      name: 'scrypt',
      N,
      r,
      p,
      salt: bytesToHex(salt),
      keyLen,
    },
    cipher: {
      name: 'aes-256-gcm',
      iv: bytesToHex(iv),
      tag: bytesToHex(tag),
    },
    ciphertext: bytesToHex(ct),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptToString(json: string, password: string): Promise<string> {
  let env: unknown;
  try {
    env = JSON.parse(json);
  } catch {
    throw new Error('Invalid JSON');
  }
  const e = env as Partial<EncryptedEnvelopeV1>;
  if (!e || typeof e !== 'object') throw new Error('envelope must be an object');
  if (e.version !== 1 || e.type !== 'encrypted') throw new Error('unsupported encrypted envelope');
  if (!e.kdf || e.kdf.name !== 'scrypt') throw new Error('unsupported kdf');
  if (!e.cipher || e.cipher.name !== 'aes-256-gcm') throw new Error('unsupported cipher');
  if (typeof password !== 'string' || password.length === 0) throw new Error('password is required');
  const N = e.kdf.N as number;
  const r = e.kdf.r as number;
  const p = e.kdf.p as number;
  const keyLen = e.kdf.keyLen as number;
  const salt = hexToBytes(e.kdf.salt as string, 16);
  const key = (await scrypt(password, salt, keyLen, { N, r, p })) as Buffer;
  const iv = hexToBytes(e.cipher.iv as string, 12);
  const tag = hexToBytes(e.cipher.tag as string, 16);
  const ct = hexToBytes(e.ciphertext as string);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(Buffer.from(tag));
  const pt = Buffer.concat([decipher.update(Buffer.from(ct)), decipher.final()]);
  return pt.toString('utf8');
}

export function isEncryptedEnvelope(json: string): boolean {
  try {
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' && obj.type === 'encrypted' && obj.version === 1;
  } catch {
    return false;
  }
}


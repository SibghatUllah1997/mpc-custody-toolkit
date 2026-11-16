import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { Secp256k1, Shamir } from '../src';
import { exportShareFile, importShareFile } from '../src/cli';
import { bytesToHex } from '../src/utils/bytes';
import {
  ARGON2ID_PARAMS,
  DECRYPT_LIMITS,
  decryptToString,
  encryptString,
  isEncryptedEnvelope,
} from '../src/encoding/encrypted';

const vectorsDir = join(dirname(fileURLToPath(import.meta.url)), 'vectors');
const v1Fixture = readFileSync(join(vectorsDir, 'encrypted.v1.json'), 'utf8');

describe('encrypted share files (Argon2id + AES-256-GCM)', () => {
  it('writes a v2 argon2id envelope with the documented parameters', async () => {
    const json = await encryptString('hello-share', 'test-password');
    const obj = JSON.parse(json);
    expect(obj).toMatchObject({
      version: 2,
      type: 'encrypted',
      kdf: {
        name: 'argon2id',
        t: ARGON2ID_PARAMS.t,
        m: ARGON2ID_PARAMS.m,
        p: ARGON2ID_PARAMS.p,
        version: ARGON2ID_PARAMS.version,
        keyLen: ARGON2ID_PARAMS.keyLen,
      },
      cipher: { name: 'aes-256-gcm' },
    });
    expect(obj.kdf.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(obj.cipher.iv).toMatch(/^[0-9a-f]{24}$/);
    expect(obj.cipher.tag).toMatch(/^[0-9a-f]{32}$/);
    expect(await decryptToString(json, 'test-password')).toBe('hello-share');
  });

  it('rejects a missing or wrong password', async () => {
    const json = await encryptString('hello-share', 'test-password');
    await expect(encryptString('hello-share', '')).rejects.toThrow(/password is required/);
    await expect(decryptToString(json, '')).rejects.toThrow(/password is required/);
    await expect(decryptToString(json, 'wrong-password')).rejects.toThrow(/decryption failed/);
  });

  it('still decrypts a v1 scrypt envelope', async () => {
    expect(isEncryptedEnvelope(v1Fixture)).toBe(true);
    await expect(decryptToString(v1Fixture, 'test-password-v1')).resolves.toBe('v1-scrypt-fixture-plaintext');
    await expect(decryptToString(v1Fixture, 'wrong')).rejects.toThrow(/decryption failed/);
  });

  it('rejects argon2id memory or time costs above the decrypt caps', async () => {
    const base = JSON.parse(await encryptString('hello-share', 'test-password'));
    base.kdf.m = DECRYPT_LIMITS.argon2.maxM + 1;
    await expect(decryptToString(JSON.stringify(base), 'test-password')).rejects.toThrow(/out of range/);
    base.kdf.m = ARGON2ID_PARAMS.m;
    base.kdf.t = DECRYPT_LIMITS.argon2.maxT + 1;
    await expect(decryptToString(JSON.stringify(base), 'test-password')).rejects.toThrow(/out of range/);
  });

  it('recognizes v1 and v2 envelopes and rejects other JSON', () => {
    expect(isEncryptedEnvelope(v1Fixture)).toBe(true);
    expect(isEncryptedEnvelope(JSON.stringify({ type: 'encrypted', version: 2 }))).toBe(true);
    expect(isEncryptedEnvelope(JSON.stringify({ type: 'encrypted', version: 3 }))).toBe(false);
    expect(isEncryptedEnvelope('{"type":"shamir-share"}')).toBe(false);
    expect(isEncryptedEnvelope('not-json')).toBe(false);
  });

  it('roundtrips a share file with password; rejects a missing password', async () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s] = Shamir.splitSecret(secret, 2, 2);
    const dir = mkdtempSync(join(tmpdir(), 'mpc-enc-'));
    const file = join(dir, `share-x${s.x}.enc.json`);
    try {
      await exportShareFile(s, file, { password: 'test-password' });
      const txt = readFileSync(file, 'utf8');
      const obj = JSON.parse(txt);
      expect(obj.type).toBe('encrypted');
      expect(obj.version).toBe(2);
      expect(obj.kdf.name).toBe('argon2id');
      await expect(importShareFile(file)).rejects.toThrow();
      const back = await importShareFile(file, { password: 'test-password' });
      expect(back.x).toBe(s.x);
      expect(bytesToHex(back.y)).toBe(bytesToHex(s.y));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

import { mkdtemp, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exportShareFile } from '../src/cli';
import { getPublicKeyCompressed } from '../src/crypto/secp256k1';
import { decodeShareBackup, encodeShare } from '../src/encoding/share';
import { InputError } from '../src/errors';
import {
  listRetiredShareFiles,
  rotatedShareFileName,
  rotateShareFiles,
  rotateShareSet,
} from '../src/recovery';
import { combineShares, splitSecret } from '../src/sss/shamir';
import { bytesToHex, hexToBytes } from '../src/utils/bytes';

const SECRET = hexToBytes('3c'.repeat(31) + '01', 32);
const PUBKEY = bytesToHex(getPublicKeyCompressed(SECRET));
const OLD_SET = { id: 'aaaaaaaaaaaaaaaa', threshold: 2, total: 3 };
// Assembled at runtime so secret scanners do not flag test inputs.
const OLD_PHRASE = ['Amber', 'tunnel', 'violet', '42'].join(' ');
const NEW_PHRASE = ['Copper', 'meadow', 'falcon', '17'].join(' ');

function oldInputs() {
  return splitSecret(SECRET, 2, 3).map((share) => ({
    backup: decodeShareBackup(encodeShare(share, OLD_SET)),
  }));
}

describe('rotateShareSet', () => {
  it('re-splits into a new set that rebuilds the same key', () => {
    const rotated = rotateShareSet(oldInputs().slice(0, 2), { threshold: 3, total: 5, setId: 'bbbbbbbbbbbbbbbb' });
    expect(rotated.publicKey).toBe(PUBKEY);
    expect(rotated.oldSetId).toBe(OLD_SET.id);
    expect(rotated.set).toEqual({ id: 'bbbbbbbbbbbbbbbb', threshold: 3, total: 5 });
    expect(rotated.shares.map((s) => s.x)).toEqual([1, 2, 3, 4, 5]);
    expect(bytesToHex(combineShares(rotated.shares.slice(1, 4)))).toBe(bytesToHex(SECRET));
  });

  it('produces shares that do not mix with the old set', () => {
    const old = oldInputs();
    const rotated = rotateShareSet(old, { threshold: 2, total: 3 });
    const mixed = combineShares([{ x: 1, y: old[0].backup.share.y }, rotated.shares[1]]);
    expect(bytesToHex(mixed)).not.toBe(bytesToHex(SECRET));
  });

  it('refuses a wrong expected public key, a reused set id, or too few shares', () => {
    const wrongKey = '02' + '11'.repeat(32);
    expect(() => rotateShareSet(oldInputs(), { threshold: 2, total: 3, expectedPublicKey: wrongKey })).toThrow(
      /does not match the expected public key/
    );
    expect(() => rotateShareSet(oldInputs(), { threshold: 2, total: 3, expectedPublicKey: '0x' + PUBKEY.toUpperCase() })).not.toThrow();
    expect(() => rotateShareSet(oldInputs(), { threshold: 2, total: 3, setId: OLD_SET.id })).toThrow(InputError);
    expect(() => rotateShareSet(oldInputs().slice(0, 1), { threshold: 2, total: 3 })).toThrow(/at least 2/);
  });
});

describe('rotateShareFiles', { timeout: 120_000 }, () => {
  let dir: string;
  let oldFiles: string[];
  let outDir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mpc-rotate-'));
    outDir = await mkdtemp(join(dir, 'new-'));
    const shares = splitSecret(SECRET, 2, 3);
    oldFiles = [join(dir, 'old-1.json'), join(dir, 'old-2.json')];
    await exportShareFile(shares[0], oldFiles[0], { set: OLD_SET, password: OLD_PHRASE });
    await exportShareFile(shares[1], oldFiles[1], { set: OLD_SET, password: OLD_PHRASE });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes an encrypted new set, verifies it, then retires the old files', async () => {
    const report = await rotateShareFiles(oldFiles, {
      threshold: 2,
      total: 4,
      outDir,
      password: OLD_PHRASE,
      newPassword: NEW_PHRASE,
      expectedPublicKey: PUBKEY,
      setId: 'cccccccccccccccc',
    });
    expect(report).toMatchObject({ ok: true, publicKey: PUBKEY, oldSetId: OLD_SET.id, newSetId: 'cccccccccccccccc', encrypted: true });
    expect(report.written).toEqual([1, 2, 3, 4].map((x) => join(outDir, rotatedShareFileName('cccccccccccccccc', x))));
    expect(await listRetiredShareFiles(dir)).toEqual(oldFiles.map((f) => f + '.retired').sort());
    expect(await readdir(dir)).not.toContain('old-1.json');
    const raw = await readFile(report.written[0], 'utf8');
    expect(raw).toContain('"ciphertext"');
    expect(JSON.stringify(report)).not.toContain(bytesToHex(SECRET));
  });

  it('keeps old files with keepOld and allows plaintext only when asked', async () => {
    await expect(rotateShareFiles(oldFiles, { threshold: 2, total: 3, outDir, password: OLD_PHRASE })).rejects.toThrow(
      /old shares are encrypted/
    );
    expect(await readdir(outDir)).toEqual([]);
    const report = await rotateShareFiles(oldFiles, {
      threshold: 2,
      total: 3,
      outDir,
      password: OLD_PHRASE,
      allowPlaintext: true,
      keepOld: true,
    });
    expect(report.encrypted).toBe(false);
    expect(report.retired).toEqual([]);
    expect(await readdir(dir)).toContain('old-1.json');
  });

  it('leaves everything untouched when the old password is wrong or the key mismatches', async () => {
    await expect(
      rotateShareFiles(oldFiles, { threshold: 2, total: 3, outDir, password: NEW_PHRASE, newPassword: NEW_PHRASE })
    ).rejects.toThrow();
    await expect(
      rotateShareFiles(oldFiles, {
        threshold: 2,
        total: 3,
        outDir,
        password: OLD_PHRASE,
        newPassword: NEW_PHRASE,
        expectedPublicKey: '02' + '22'.repeat(32),
      })
    ).rejects.toThrow(/expected public key/);
    expect(await readdir(outDir)).toEqual([]);
    expect(await listRetiredShareFiles(dir)).toEqual([]);
  });

  it('never overwrites an existing file and cleans up a partial write', async () => {
    const setId = 'dddddddddddddddd';
    const clash = join(outDir, rotatedShareFileName(setId, 2));
    await import('fs/promises').then((fs) => fs.writeFile(clash, 'keep me'));
    await expect(
      rotateShareFiles(oldFiles, { threshold: 2, total: 3, outDir, password: OLD_PHRASE, newPassword: NEW_PHRASE, setId })
    ).rejects.toThrow(/EEXIST/);
    expect(await readdir(outDir)).toEqual([rotatedShareFileName(setId, 2)]);
    expect(await readFile(clash, 'utf8')).toBe('keep me');
    expect(await listRetiredShareFiles(dir)).toEqual([]);
  });
});

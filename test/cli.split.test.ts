import { describe, it, expect } from 'vitest';
import { Secp256k1, Shamir } from '../src';
import { exportShareFile, combineFromFiles, validateSplitArgs } from '../src/cli';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('CLI split argument checks', () => {
  it('accepts a 2-of-3 split', () => {
    expect(() => validateSplitArgs(2, 3)).not.toThrow();
  });

  it('rejects n greater than 8', () => {
    expect(() => validateSplitArgs(2, 9)).toThrow(/--total must be an integer <= 8/);
  });

  it('rejects a non-integer threshold', () => {
    expect(() => validateSplitArgs(2.5, 3)).toThrow(/--threshold must be an integer >= 2/);
  });

  it('rejects total below threshold', () => {
    expect(() => validateSplitArgs(3, 2)).toThrow(/--total must be an integer >= --threshold/);
  });
});

describe('CLI combine --files duplicate x', () => {
  it('names both files when two backups share the same x', async () => {
    const secret = Secp256k1.generatePrivateKey();
    const [s1] = Shamir.splitSecret(secret, 2, 3);
    const dir = mkdtempSync(join(tmpdir(), 'mpc-dup-'));
    try {
      const a = join(dir, 'a.json');
      const b = join(dir, 'b.json');
      await exportShareFile(s1, a);
      await exportShareFile(s1, b);
      await expect(combineFromFiles([a, b])).rejects.toThrow(
        `duplicate share x=${s1.x} in ${a} and ${b}`
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

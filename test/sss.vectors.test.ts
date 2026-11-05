import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { Shamir } from '../src';
import { bytesToHex, hexToBytes } from '../src/utils/bytes';

type VectorShare = { x: number; yHex: string };

type ShamirVector = {
  id: string;
  threshold: number;
  totalShares: number;
  secretHex: string;
  higherCoeffsHex: string[];
  shares: VectorShare[];
  combineSubsets: number[][];
};

type Suite = {
  field: string;
  modulusHex: string;
  byteLength: number;
  vectors: ShamirVector[];
};

const suitePath = join(dirname(fileURLToPath(import.meta.url)), 'vectors', 'shamir.v1.json');
const suite = JSON.parse(readFileSync(suitePath, 'utf8')) as Suite;

describe('Shamir published reconstruction vectors', () => {
  it('records the secp256k1 scalar field and 32-byte share width', () => {
    expect(suite.field).toBe('secp256k1-scalar');
    expect(suite.byteLength).toBe(32);
    expect(suite.modulusHex).toBe(Shamir.utils.FIELD_N.toString(16));
  });

  it('contains several independent cases', () => {
    expect(suite.vectors.length).toBeGreaterThanOrEqual(4);
    const ids = suite.vectors.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const vector of suite.vectors) {
    describe(vector.id, () => {
      it('matches splitSecretWithCoeffs output exactly', () => {
        const produced = Shamir.splitSecretWithCoeffs(
          vector.secretHex,
          vector.higherCoeffsHex,
          vector.totalShares
        );
        expect(produced).toHaveLength(vector.shares.length);
        expect(vector.higherCoeffsHex).toHaveLength(vector.threshold - 1);
        for (let i = 0; i < produced.length; i++) {
          expect(produced[i].x).toBe(vector.shares[i].x);
          expect(bytesToHex(produced[i].y)).toBe(vector.shares[i].yHex);
        }
      });

      it('reconstructs the secret from every listed subset', () => {
        const byX = new Map(vector.shares.map((s) => [s.x, s]));
        expect(vector.combineSubsets.length).toBeGreaterThan(0);
        for (const subset of vector.combineSubsets) {
          expect(subset.length).toBe(vector.threshold);
          const shares = subset.map((x) => {
            const row = byX.get(x);
            expect(row).toBeDefined();
            return { x, y: hexToBytes(row!.yHex, 32) };
          });
          const recovered = Shamir.combineShares(shares);
          expect(bytesToHex(recovered)).toBe(vector.secretHex);
        }
      });
    });
  }

  it('does not reconstruct a 3-of-5 secret from only two shares', () => {
    const vector = suite.vectors.find((v) => v.id === 'quadratic-3-of-5');
    expect(vector).toBeDefined();
    const two = vector!.shares.slice(0, 2).map((s) => ({ x: s.x, y: hexToBytes(s.yHex, 32) }));
    const recovered = Shamir.combineShares(two);
    expect(bytesToHex(recovered)).not.toBe(vector!.secretHex);
  });
});

import { describe, expect, it } from 'vitest';
import { Passphrase } from '../src';
import { InputError } from '../src/errors';
import {
  CONFIRM_PASSWORD_PROMPT,
  MIN_PASSPHRASE_CLASSES,
  MIN_PASSPHRASE_LENGTH,
  analyzePassphrase,
  assertPassphraseConfirmation,
  assertPassphraseStrength,
  resolveExportPassphrase,
} from '../src/encoding/passphrase';

const STRONG = 'VaultShare-42';

describe('analyzePassphrase', () => {
  it('accepts a mixed 12+ character passphrase', () => {
    const result = analyzePassphrase(STRONG);
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.length).toBe(STRONG.length);
    expect(result.classCount).toBe(4);
    expect(result.classes).toEqual(['lower', 'upper', 'digit', 'symbol']);
    expect(result.reasons).toEqual([]);
  });

  it('rejects empty, non-string, and short values', () => {
    expect(analyzePassphrase('').ok).toBe(false);
    expect(analyzePassphrase('').reasons[0]).toMatch(/required/);
    expect(analyzePassphrase(null).ok).toBe(false);
    expect(analyzePassphrase(1).reasons[0]).toMatch(/must be a string/);
    const short = analyzePassphrase('Ab1!');
    expect(short.ok).toBe(false);
    expect(short.reasons[0]).toMatch(new RegExp(`at least ${MIN_PASSPHRASE_LENGTH}`));
    expect(short.score).toBe(0);
  });

  it('rejects a long passphrase that uses too few character classes', () => {
    const result = analyzePassphrase('onlylowercase');
    expect(result.ok).toBe(false);
    expect(result.classCount).toBeLessThan(MIN_PASSPHRASE_CLASSES);
    expect(result.reasons[0]).toMatch(/mix at least 3/);
  });

  it('rejects common, repeated, and sequential passphrases', () => {
    expect(analyzePassphrase('password1234').reasons).toContain('password is too common');
    expect(analyzePassphrase('PASSWORD1234').reasons).toContain('password is too common');
    expect(analyzePassphrase('aaaaaaaaaaaa').reasons.some((r) => /repeated/.test(r))).toBe(true);
    expect(analyzePassphrase('abcdefghijkl').reasons.some((r) => /sequential/.test(r))).toBe(true);
    expect(analyzePassphrase('987654321098').reasons.some((r) => /sequential/.test(r))).toBe(true);
  });

  it('scores longer mixed passphrases higher', () => {
    const ok = analyzePassphrase(STRONG);
    const stronger = analyzePassphrase('VaultShare-42-Extra');
    expect(ok.ok).toBe(true);
    expect(stronger.ok).toBe(true);
    expect(stronger.score).toBeGreaterThan(ok.score);
  });
});

describe('assertPassphraseStrength', () => {
  it('returns silently for an acceptable passphrase', () => {
    expect(() => assertPassphraseStrength(STRONG)).not.toThrow();
    expect(() => Passphrase.assertPassphraseStrength(STRONG)).not.toThrow();
  });

  it('throws a coded InputError for a weak passphrase', () => {
    try {
      assertPassphraseStrength('pw', 'password');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InputError);
      expect((err as InputError).code).toBe('weak-passphrase');
      expect((err as InputError).field).toBe('password');
      expect((err as InputError).message).toMatch(/at least 12/);
    }
  });
});

describe('passphrase confirmation', () => {
  it('accepts an identical confirmation', () => {
    expect(() => assertPassphraseConfirmation(STRONG, STRONG)).not.toThrow();
  });

  it('rejects a missing or different confirmation', () => {
    try {
      assertPassphraseConfirmation(STRONG, 'VaultShare-43');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InputError);
      expect((err as InputError).code).toBe('mismatch');
      expect((err as InputError).field).toBe('confirm-password');
    }
    expect(() => assertPassphraseConfirmation(STRONG, '')).toThrow(/does not match/);
  });

  it('returns the password when confirmation matches and strength passes', async () => {
    await expect(resolveExportPassphrase({ password: STRONG, confirmation: STRONG })).resolves.toBe(STRONG);
  });

  it('asks the prompt when confirmation is omitted', async () => {
    const questions: string[] = [];
    const out = await resolveExportPassphrase({
      password: STRONG,
      prompt: async (question) => {
        questions.push(question);
        return STRONG;
      },
    });
    expect(out).toBe(STRONG);
    expect(questions).toEqual([CONFIRM_PASSWORD_PROMPT]);
  });

  it('fails closed without a confirmation or prompt, and on a weak match', async () => {
    await expect(resolveExportPassphrase({ password: STRONG })).rejects.toMatchObject({
      code: 'missing-value',
      field: 'confirm-password',
    });
    await expect(
      resolveExportPassphrase({ password: 'pw', confirmation: 'pw' })
    ).rejects.toMatchObject({ code: 'weak-passphrase' });
    await expect(
      resolveExportPassphrase({ password: STRONG, confirmation: 'nope' })
    ).rejects.toMatchObject({ code: 'mismatch' });
  });
});

import { describe, expect, it } from 'vitest';
import { InputError } from '../src/errors';
import { parseArgs, resolveExportPasswordFromArgs } from '../src/cli';

const STRONG = 'VaultShare-42';

async function expectCode(
  fn: () => Promise<unknown>,
  code: InputError['code'],
  pattern: RegExp
): Promise<void> {
  try {
    await fn();
    throw new Error('expected throw');
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).code).toBe(code);
    expect((err as InputError).message).toMatch(pattern);
  }
}

describe('resolveExportPasswordFromArgs', () => {
  it('returns undefined when --password is omitted', async () => {
    await expect(resolveExportPasswordFromArgs(parseArgs(['export-share']))).resolves.toBeUndefined();
  });

  it('accepts a strong password with a matching --confirm-password', async () => {
    const args = parseArgs([
      'export-share',
      '--password',
      STRONG,
      '--confirm-password',
      STRONG,
    ]);
    await expect(resolveExportPasswordFromArgs(args)).resolves.toBe(STRONG);
  });

  it('rejects a mismatched confirmation', async () => {
    const args = parseArgs([
      'export-share',
      '--password',
      STRONG,
      '--confirm-password',
      'VaultShare-99',
    ]);
    await expectCode(() => resolveExportPasswordFromArgs(args), 'mismatch', /does not match/);
  });

  it('requires --confirm-password when no prompt is available', async () => {
    const args = parseArgs(['export-share', '--password', STRONG]);
    await expectCode(
      () => resolveExportPasswordFromArgs(args),
      'missing-value',
      /requires --confirm-password/
    );
  });

  it('rejects a weak password even when confirmation matches', async () => {
    const args = parseArgs(['export-share', '--password', 'pw', '--confirm-password', 'pw']);
    await expectCode(() => resolveExportPasswordFromArgs(args), 'weak-passphrase', /at least 12/);
  });

  it('uses the prompt when --confirm-password is omitted', async () => {
    const args = parseArgs(['export-share', '--password', STRONG]);
    const got = await resolveExportPasswordFromArgs(args, async () => STRONG);
    expect(got).toBe(STRONG);
  });
});

import { describe, expect, it } from 'vitest';
import { InputError } from '../src/errors';
import { parseArgs, parseRotateArgs } from '../src/cli';
import { renderCliError } from '../src/ux/errors';

const NEW_PHRASE = ['Copper', 'meadow', 'falcon', '17'].join(' ');
const base = ['--files', 'a.json,b.json', '--threshold', '3', '--total', '5', '--out-dir', 'next'];

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    return (err as InputError).code;
  }
  throw new Error('expected rejection');
}

describe('parseRotateArgs', () => {
  it('parses the new set and optional flags', async () => {
    const out = await parseRotateArgs(
      parseArgs([...base, '--new-password', NEW_PHRASE, '--confirm-new-password', NEW_PHRASE, '--pubkey', '02ab', '--keep-old'])
    );
    expect(out).toEqual({
      files: ['a.json', 'b.json'],
      outDir: 'next',
      threshold: 3,
      total: 5,
      newPassword: NEW_PHRASE,
      expectedPublicKey: '02ab',
      keepOld: true,
    });
  });

  it('requires files, out-dir, and the new threshold/total', async () => {
    expect(await codeOf(parseRotateArgs(parseArgs(['--threshold', '2', '--total', '3', '--out-dir', 'x'])))).toBe('missing-value');
    expect(await codeOf(parseRotateArgs(parseArgs(['--files', 'a,b', '--threshold', '2', '--total', '3'])))).toBe('missing-value');
    expect(await codeOf(parseRotateArgs(parseArgs(['--files', 'a,b', '--out-dir', 'x'])))).toBe('missing-value');
    expect(await codeOf(parseRotateArgs(parseArgs(['--files', 'a,b', '--out-dir', 'x', '--threshold', '4', '--total', '3'])))).toBe('invalid-range');
  });

  it('confirms and strength-checks the new password', async () => {
    expect(await codeOf(parseRotateArgs(parseArgs([...base, '--new-password', NEW_PHRASE])))).toBe('missing-value');
    expect(
      await codeOf(parseRotateArgs(parseArgs([...base, '--new-password', NEW_PHRASE, '--confirm-new-password', NEW_PHRASE + '!'])))
    ).toBe('mismatch');
    const asked: string[] = [];
    const out = await parseRotateArgs(parseArgs([...base, '--new-password', NEW_PHRASE]), async (q) => {
      asked.push(q);
      return NEW_PHRASE;
    });
    expect(out.newPassword).toBe(NEW_PHRASE);
    expect(asked).toHaveLength(1);
  });

  it('prints a hint when old encrypted shares would become plaintext', () => {
    const text = renderCliError(new Error('old shares are encrypted; pass --new-password (or --allow-plaintext) for the new set'), { json: true });
    expect(text).toMatch(/--allow-plaintext/);
  });
});

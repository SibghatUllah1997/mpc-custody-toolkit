import { describe, expect, it } from 'vitest';
import { cliColorMode, emitCliResult, parseArgs } from '../src/cli';
import { wantsJson } from '../src/ux/output';

describe('CLI parseArgs and --json', () => {
  it('treats --json and --no-color as boolean flags', () => {
    const args = parseArgs(['keygen', '--json', '--no-color']);
    expect(args._).toEqual(['keygen']);
    expect(args.json).toBe(true);
    expect(args['no-color']).toBe(true);
    expect(wantsJson(args)).toBe(true);
    expect(cliColorMode(args)).toBe('never');
  });

  it('accepts --color always/never', () => {
    expect(cliColorMode(parseArgs(['--color', 'always']))).toBe('always');
    expect(cliColorMode(parseArgs(['--color', 'never']))).toBe('never');
    expect(cliColorMode(parseArgs([]))).toBe('auto');
  });

  it('emits JSON or unlabeled human text from the same payload', () => {
    const payload = { publicKey: '02aa', threshold: 2 };
    const jsonArgs = parseArgs(['--json', '--no-color']);
    const humanArgs = parseArgs(['--no-color']);
    expect(JSON.parse(emitCliResult(payload, jsonArgs))).toEqual(payload);
    const human = emitCliResult(payload, humanArgs);
    expect(human).toContain('public key   02aa');
    expect(human).toContain('threshold    2');
    expect(human).not.toContain('\u001b[');
  });
});

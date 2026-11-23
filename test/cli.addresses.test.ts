import { HDKey } from '@scure/bip32';
import { describe, expect, it } from 'vitest';
import { parseArgs, runAddresses } from '../src/cli';
import { InputError } from '../src/errors';
import { deriveFromMnemonic, listWatchAddresses, mnemonicToSeed } from '../src/hd';
import { optionalFlagInt, requireFlagString } from '../src/ux/flags';
import { explainError } from '../src/ux/errors';

const DEV = 'test test test test test test test test test test test junk';

function expectCode(fn: () => unknown, code: InputError['code'], pattern: RegExp): void {
  try {
    fn();
    throw new Error('expected throw');
  } catch (err) {
    expect(err).toBeInstanceOf(InputError);
    expect((err as InputError).code).toBe(code);
    expect((err as InputError).message).toMatch(pattern);
  }
}

function accountXpub(): string {
  const account = deriveFromMnemonic({ mnemonic: DEV, path: "m/44'/60'/0'" });
  account.privateKey.fill(0);
  return account.xpub;
}

describe('CLI addresses', () => {
  it('lists the same watch-only rows as the library helper', () => {
    const xpub = accountXpub();
    const out = runAddresses({ xpub, chain: 0, start: 0, count: 2 });
    expect(out).toEqual(listWatchAddresses({ xpub, chain: 0, start: 0, count: 2 }));
    expect(out.addresses[0].address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
    expect(out.addresses[1].path).toBe('0/1');
  });

  it('reads --xpub --start --count --chain from argv', () => {
    const xpub = accountXpub();
    const args = parseArgs(['addresses', '--xpub', xpub, '--start', '2', '--count', '1', '--chain', '0']);
    expect(requireFlagString(args, 'xpub')).toBe(xpub);
    expect(optionalFlagInt(args, 'start')).toBe(2);
    expect(optionalFlagInt(args, 'count')).toBe(1);
    expect(optionalFlagInt(args, 'chain')).toBe(0);
    const out = runAddresses({
      xpub: requireFlagString(args, 'xpub'),
      start: optionalFlagInt(args, 'start'),
      count: optionalFlagInt(args, 'count'),
      chain: optionalFlagInt(args, 'chain'),
    });
    expect(out.addresses).toHaveLength(1);
    expect(out.addresses[0].index).toBe(2);
  });

  it('refuses a missing xpub, an xprv, and a hardened chain', () => {
    expectCode(
      () => requireFlagString(parseArgs(['addresses']), 'xpub', { message: 'addresses requires --xpub <key>' }),
      'missing-value',
      /addresses requires --xpub/
    );
    const seed = mnemonicToSeed(DEV);
    const xprv = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'").privateExtendedKey;
    seed.fill(0);
    expectCode(() => runAddresses({ xpub: xprv, count: 1 }), 'invalid-type', /xpub keys only/);
    expect(explainError(new Error('addresses requires --xpub <key>')).hint).toMatch(/account or chain xpub/);
    expect(explainError(new Error('watch-only listing accepts xpub keys only')).hint).toMatch(/not an xprv/);
  });
});

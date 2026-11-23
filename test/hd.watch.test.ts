import { HDKey } from '@scure/bip32';
import { describe, expect, it } from 'vitest';
import { publicKeyToAddress } from '../src/eip';
import { InputError } from '../src/errors';
import {
  DEFAULT_PATH,
  DEFAULT_WATCH_COUNT,
  MAX_WATCH_COUNT,
  deriveFromMnemonic,
  listWatchAddresses,
  mnemonicToSeed,
  parseXpub,
} from '../src/hd';
import { bytesToHex } from '../src/utils/bytes';

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

describe('parseXpub', () => {
  it('loads a public node and refuses xprv or junk', () => {
    const xpub = accountXpub();
    const node = parseXpub(`  ${xpub}  `);
    expect(node.privateKey).toBeNull();
    expect(node.publicExtendedKey).toBe(xpub);

    const seed = mnemonicToSeed(DEV);
    const xprv = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'").privateExtendedKey;
    seed.fill(0);
    expectCode(() => parseXpub(xprv), 'invalid-type', /xpub keys only/);
    expectCode(() => parseXpub(''), 'missing-value', /xpub is required/);
    expectCode(() => parseXpub('xpub1notreal'), 'invalid-type', /not a valid BIP-32/);
  });
});

describe('listWatchAddresses', () => {
  it('lists account-level external addresses that match a secret derivation', () => {
    const xpub = accountXpub();
    const listed = listWatchAddresses({ xpub, chain: 0, start: 0, count: 3 });
    expect(listed.fingerprint).toBe('3bf95407');
    expect(listed.chain).toBe(0);
    expect(listed.addresses).toHaveLength(3);
    expect(listed.addresses[0].address).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');

    for (let i = 0; i < 3; i++) {
      const secret = deriveFromMnemonic({ mnemonic: DEV, path: `m/44'/60'/0'/0/${i}` });
      expect(listed.addresses[i].index).toBe(i);
      expect(listed.addresses[i].path).toBe(`0/${i}`);
      expect(listed.addresses[i].publicKey).toBe(bytesToHex(secret.publicKey));
      expect(listed.addresses[i].address).toBe(publicKeyToAddress(secret.publicKey));
      expect(listed.addresses[i].publicKey).not.toBe(bytesToHex(secret.privateKey));
      secret.privateKey.fill(0);
    }
  });

  it('indexes directly under a chain xpub and can skip with start', () => {
    const external = deriveFromMnemonic({ mnemonic: DEV, path: "m/44'/60'/0'/0" });
    external.privateKey.fill(0);
    const listed = listWatchAddresses({ xpub: external.xpub, start: 1, count: 2 });
    expect(listed.chain).toBeUndefined();
    expect(listed.start).toBe(1);
    expect(listed.addresses.map((a) => a.path)).toEqual(['1', '2']);
    const second = deriveFromMnemonic({ mnemonic: DEV, path: "m/44'/60'/0'/0/1" });
    expect(listed.addresses[0].publicKey).toBe(bytesToHex(second.publicKey));
    expect(listed.addresses[0].address).toBe(publicKeyToAddress(second.publicKey));
    second.privateKey.fill(0);
  });

  it('defaults count to 20 and never returns a private key field', () => {
    const listed = listWatchAddresses({ xpub: accountXpub(), chain: 0 });
    expect(listed.count).toBe(DEFAULT_WATCH_COUNT);
    expect(listed.addresses).toHaveLength(DEFAULT_WATCH_COUNT);
    expect(listed.addresses[0]).not.toHaveProperty('privateKey');
    expect(JSON.stringify(listed)).not.toMatch(/"privateKey"/);
  });

  it('lists the change chain separately from the external chain', () => {
    const xpub = accountXpub();
    const external = listWatchAddresses({ xpub, chain: 0, count: 1 });
    const change = listWatchAddresses({ xpub, chain: 1, count: 1 });
    expect(change.addresses[0].path).toBe('1/0');
    expect(change.addresses[0].publicKey).not.toBe(external.addresses[0].publicKey);
    const secret = deriveFromMnemonic({ mnemonic: DEV, path: "m/44'/60'/0'/1/0" });
    expect(change.addresses[0].publicKey).toBe(bytesToHex(secret.publicKey));
    secret.privateKey.fill(0);
  });

  it('matches the default keygen path at index 0', () => {
    const listed = listWatchAddresses({ xpub: accountXpub(), chain: 0, count: 1 });
    const leaf = deriveFromMnemonic({ mnemonic: DEV, path: DEFAULT_PATH });
    expect(listed.addresses[0].publicKey).toBe(bytesToHex(leaf.publicKey));
    leaf.privateKey.fill(0);
  });

  it('rejects bad options, hardened indexes, and oversized counts', () => {
    const xpub = accountXpub();
    expectCode(() => listWatchAddresses(null as never), 'invalid-type', /must be an object/);
    expectCode(() => listWatchAddresses({ xpub, count: 0 }), 'invalid-range', new RegExp(`1\\.\\.${MAX_WATCH_COUNT}`));
    expectCode(() => listWatchAddresses({ xpub, count: MAX_WATCH_COUNT + 1 }), 'invalid-range', /count/);
    expectCode(() => listWatchAddresses({ xpub, start: -1 }), 'invalid-range', /start/);
    expectCode(() => listWatchAddresses({ xpub, start: 1.5 }), 'invalid-integer', /start/);
    expectCode(() => listWatchAddresses({ xpub, chain: 2 }), 'invalid-range', /chain/);
    expectCode(
      () => listWatchAddresses({ xpub, start: 0x80000000 - 1, count: 2 }),
      'invalid-range',
      /below 2\^31/
    );
  });
});

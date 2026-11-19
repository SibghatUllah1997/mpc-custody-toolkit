import { describe, expect, it } from 'vitest';
import {
  parseShareIndexList,
  parseTransactionJson,
  runSigningPrompt,
} from '../src/cli';
import { transactionDigest } from '../src/tx';
import { bytesToHex } from '../src/utils/bytes';

describe('CLI parseTransactionJson', () => {
  it('reads from, to, value, and optional data', () => {
    const tx = parseTransactionJson('{"from":"aa","to":"bb","value":"9","data":"0abc"}');
    expect(tx).toEqual({ from: 'aa', to: 'bb', value: '9', data: '0abc' });
  });

  it('defaults missing data to empty and rejects broken JSON', () => {
    expect(parseTransactionJson('{"from":"aa","to":"bb","value":"1"}').data).toBe('');
    expect(() => parseTransactionJson('{')).toThrow(/Invalid JSON for --tx/);
    expect(() => parseTransactionJson('{"from":"aa"}')).toThrow(/from, to, and value/);
  });
});

describe('CLI runSigningPrompt', () => {
  it('prints a transfer prompt whose digest matches the transaction helper', () => {
    const tx = { from: 'aa11', to: 'bb22', value: '7', data: '' };
    const out = runSigningPrompt({ tx, asset: 'ETH' });
    expect(out.title).toBe('Signing request');
    expect(out.digestHex).toBe(bytesToHex(transactionDigest(tx)));
    expect(out.text).toContain('Value        7 ETH');
    expect(out.text).toContain('Data         (empty)');
  });

  it('prints a digest prompt with share indexes', () => {
    const digestHex = '11'.repeat(32);
    const out = runSigningPrompt({
      digestHex,
      usedShareXs: parseShareIndexList('2,3'),
    });
    expect(out.title).toBe('Digest signing request');
    expect(out.text).toContain('Shares       2, 3');
  });

  it('rejects a missing payload and a bad share-index list', () => {
    expect(() => runSigningPrompt({})).toThrow(/prompt requires/);
    expect(() => parseShareIndexList('1,x')).toThrow(/positive integers/);
  });

  it('prints an EIP-191 personal message prompt from --text', () => {
    const out = runSigningPrompt({ text: 'ok' });
    expect(out.title).toBe('EIP-191 personal message');
    expect(out.text).toContain('Message      ok');
  });
});

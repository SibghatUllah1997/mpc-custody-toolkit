import { publicKeyToAddress } from '../eip/index.js';
import { describeDigestSigning, describeSigningRequest } from '../prompt/signing.js';
import type { SigningPrompt } from '../prompt/types.js';
import type { AirgapSignRequest } from './types.js';

function field(label: string, value: string): string {
  return `  ${label.padEnd(12)} ${value}`;
}

/**
 * What the offline signer sees before signing: the usual transaction or
 * digest prompt, plus the request id, signing key and any note.
 */
export function describeAirgapRequest(req: AirgapSignRequest): SigningPrompt {
  const base =
    req.kind === 'transaction' && req.tx
      ? describeSigningRequest({ tx: req.tx, asset: req.asset })
      : describeDigestSigning({ digestHex: req.digest });
  if (base.digestHex !== req.digest) {
    throw new Error('prompt digest does not match the request digest');
  }
  const extra = [
    field('Request', req.id),
    field('Signing key', req.publicKey),
    field('Address', publicKeyToAddress(req.publicKey)),
  ];
  if (req.expiresAt !== undefined) extra.push(field('Expires', req.expiresAt));
  if (req.note !== undefined) extra.push(field('Note', req.note === '' ? '(empty)' : req.note));
  const title = `Air-gap ${base.title.toLowerCase()}`;
  const lines = Object.freeze([title, ...base.lines.slice(1), ...extra]) as string[];
  return Object.freeze({ title, lines, text: lines.join('\n'), digestHex: base.digestHex });
}

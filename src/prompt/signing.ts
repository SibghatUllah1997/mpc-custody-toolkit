import { freezeTransaction } from '../tx/validate.js';
import { transactionDigest } from '../tx/digest.js';
import { bytesToHex, hexToBytes, normalizeHex } from '../utils/bytes.js';
import type { DigestPromptInput, SigningPrompt, SigningPromptInput } from './types.js';

const DIGEST_BYTES = 32;
const PUBLIC_KEY_BYTES = 33;

function freezePrompt(title: string, body: string[], digestHex: string): SigningPrompt {
  const lines = Object.freeze([title, ...body]) as string[];
  return Object.freeze({
    title,
    lines,
    text: lines.join('\n'),
    digestHex,
  });
}

function field(label: string, value: string): string {
  return `  ${label.padEnd(12)} ${value}`;
}

function dataSummary(data: string): string {
  if (data === '') return '(empty)';
  const bytes = data.length / 2;
  return `${data} (${bytes} byte${bytes === 1 ? '' : 's'})`;
}

/**
 * Explain a chain-agnostic transfer in plain language, including the digest
 * that will actually be signed. Optional policy and simulation lines are
 * appended when those results are supplied.
 */
export function describeSigningRequest(input: SigningPromptInput): SigningPrompt {
  if (!input || typeof input !== 'object') {
    throw new Error('signing prompt input must be an object');
  }
  const tx = freezeTransaction(input.tx);
  const digestHex = bytesToHex(transactionDigest(tx));
  const body = [
    field('From', tx.from),
    field('To', tx.to),
    field('Value', input.asset ? `${tx.value} ${input.asset}` : tx.value),
    field('Data', dataSummary(tx.data)),
    field('Digest', digestHex),
  ];
  if (input.policy) {
    body.push(
      field(
        'Approvals',
        `${input.policy.approvalCount} recorded (${input.policy.allowed ? 'policy allows' : 'policy denies'})`
      )
    );
  }
  if (input.simulation) {
    body.push(field('Gas', input.simulation.gasUnits));
    body.push(field('Fee', input.simulation.fee));
    body.push(field('Total', input.simulation.total));
    if (input.simulation.limit) {
      const limit = input.simulation.limit;
      body.push(
        field(
          'Limit',
          limit.withinLimit
            ? `${limit.counted} of ${limit.maxValue} ${limit.asset} (headroom ${limit.headroom})`
            : `${limit.counted} exceeds ${limit.maxValue} ${limit.asset}`
        )
      );
    }
  }
  return freezePrompt('Signing request', body, digestHex);
}

/**
 * Explain a raw 32-byte digest signing, used by the offline threshold demo
 * when there is no transaction object.
 */
export function describeDigestSigning(input: DigestPromptInput): SigningPrompt {
  if (!input || typeof input !== 'object') {
    throw new Error('digest prompt input must be an object');
  }
  if (typeof input.digestHex !== 'string' || input.digestHex.length === 0) {
    throw new Error('digestHex is required');
  }
  const digestHex = normalizeHex(input.digestHex);
  hexToBytes(digestHex, DIGEST_BYTES);
  const body = [field('Digest', digestHex)];
  if (input.usedShareXs && input.usedShareXs.length > 0) {
    body.push(field('Shares', input.usedShareXs.join(', ')));
  }
  if (input.publicKeyHex) {
    const pub = normalizeHex(input.publicKeyHex);
    hexToBytes(pub, PUBLIC_KEY_BYTES);
    body.push(field('Public key', pub));
  }
  return freezePrompt('Digest signing request', body, digestHex);
}

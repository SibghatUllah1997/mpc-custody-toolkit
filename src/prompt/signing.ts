import {
  hashPersonalMessage,
  hashTypedDataParts,
  publicKeyToAddress,
  resolvePersonalMessage,
} from '../eip/index.js';
import { freezeTransaction } from '../tx/validate.js';
import { transactionDigest } from '../tx/digest.js';
import { bytesToHex, hexToBytes, normalizeHex } from '../utils/bytes.js';
import type {
  DigestPromptInput,
  PersonalPromptInput,
  SigningPrompt,
  SigningPromptInput,
  TypedDataPromptInput,
} from './types.js';

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

function publicKeyLines(publicKeyHex: string | undefined): string[] {
  if (!publicKeyHex) return [];
  const pub = normalizeHex(publicKeyHex);
  hexToBytes(pub, PUBLIC_KEY_BYTES);
  const lines = [field('Public key', pub)];
  try {
    lines.push(field('Address', publicKeyToAddress(pub)));
  } catch {
    // Length-checked hex that is not a curve point still shows the key.
  }
  return lines;
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
    ...publicKeyLines(input.publicKeyHex),
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
  body.push(...publicKeyLines(input.publicKeyHex));
  return freezePrompt('Digest signing request', body, digestHex);
}

const PREVIEW_CHARS = 96;

function previewText(text: string): string {
  if (text.length <= PREVIEW_CHARS) return text === '' ? '(empty)' : text;
  return `${text.slice(0, PREVIEW_CHARS)}…`;
}

function previewHex(bytes: Uint8Array): string {
  const hex = bytesToHex(bytes);
  if (hex.length <= PREVIEW_CHARS) return hex === '' ? '(empty)' : hex;
  return `${hex.slice(0, PREVIEW_CHARS)}…`;
}

function personalPreview(input: PersonalPromptInput, bytes: Uint8Array): { label: string; value: string } {
  if ('text' in input && input.text !== undefined) {
    return { label: 'Message', value: previewText(input.text) };
  }
  return { label: 'Payload', value: previewHex(bytes) };
}

/**
 * Explain an EIP-191 personal_sign payload, including the keccak-256 digest
 * a wallet would actually sign.
 */
export function describePersonalSigning(input: PersonalPromptInput): SigningPrompt {
  const bytes = resolvePersonalMessage(input);
  const digestHex = bytesToHex(hashPersonalMessage(bytes));
  const shown = personalPreview(input, bytes);
  const body = [
    field('Kind', 'EIP-191 personal_sign'),
    field(shown.label, shown.value),
    field('Bytes', String(bytes.length)),
    field('Digest', digestHex),
  ];
  return freezePrompt('EIP-191 personal message', body, digestHex);
}

/**
 * Explain EIP-712 typed data: domain, primary type, and the digest
 * keccak256("\\x19\\x01" || domainSeparator || hashStruct(message)).
 */
export function describeTypedDataSigning(input: TypedDataPromptInput): SigningPrompt {
  if (!input || typeof input !== 'object') {
    throw new Error('typed data prompt input must be an object');
  }
  const parts = hashTypedDataParts(input.typedData);
  const digestHex = bytesToHex(parts.digest);
  const domain = input.typedData.domain;
  const body = [field('Kind', 'EIP-712 typed data')];
  if (domain.name !== undefined) body.push(field('Domain', String(domain.name)));
  if (domain.version !== undefined) body.push(field('Version', String(domain.version)));
  if (domain.chainId !== undefined) body.push(field('Chain ID', String(domain.chainId)));
  if (domain.verifyingContract !== undefined) {
    body.push(field('Contract', normalizeHex(domain.verifyingContract)));
  }
  body.push(field('Type', input.typedData.primaryType));
  body.push(field('Digest', digestHex));
  return freezePrompt('EIP-712 typed data', body, digestHex);
}

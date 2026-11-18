/**
 * Map known CLI error messages to a short hint. Unknown errors still print
 * the original message; the hint is extra, never a substitute.
 */

import { InputError, isInputError, type InputErrorCode } from '../errors/input.js';
import { SchemaError } from '../schema/errors.js';
import { style } from './color.js';

export type HelpfulError = {
  message: string;
  hint?: string;
  code?: string;
  field?: string;
};

const HINTS: Array<{ test: RegExp; hint: string }> = [
  { test: /Invalid JSON for --shares/, hint: 'Pass a JSON array of { "x": <int>, "y": "<64-hex>" } objects.' },
  { test: /Invalid JSON for --tx/, hint: 'Pass a JSON object with from, to, value, and optional data hex fields.' },
  { test: /--shares must be a JSON array of at least 2 shares/, hint: 'Threshold combine needs at least two distinct shares.' },
  { test: /need at least 2 files/, hint: 'Pass two or more comma-separated paths to --files.' },
  { test: /duplicate share x=/, hint: 'Each backup file must have a unique share index x.' },
  { test: /duplicate index/, hint: 'List each share index once, for example --share-x 1,2.' },
  { test: /--threshold must be an integer >= 2/, hint: 'Use --threshold 2 (or higher) and --total at least that large.' },
  { test: /--total must be an integer >= --threshold/, hint: 'Raise --total so it is at least --threshold.' },
  { test: /--total must be an integer <=/, hint: 'This toolkit caps splits at 8 shares.' },
  { test: /must be an integer in 1\.\.8/, hint: 'This toolkit caps splits at 8 shares; indexes start at 1.' },
  { test: /--digest <hex> is required/, hint: 'Provide a 32-byte digest as 64 hex characters, with or without 0x.' },
  { test: /expected 32 bytes/, hint: 'Digests and share y values are 32 bytes (64 hex chars).' },
  { test: /does not match the expected public key/, hint: 'The shares reconstructed a different key than --pubkey.' },
  { test: /threshold-sign requires --shares/, hint: 'Pass --shares \'<json>\', --files a.json,b.json, or --stream vault.ndjson plus --digest.' },
  { test: /combine requires --shares/, hint: 'Pass --shares \'<json>\', --files a.json,b.json, or --stream vault.ndjson.' },
  {
    test: /recover-dry-run requires --files/,
    hint: 'Pass --files a.json,b.json or --stream vault.ndjson. The secret is never printed.',
  },
  {
    test: /recover-dry-run accepts --files or --stream/,
    hint: 'Choose one input: comma-separated share files, or a single NDJSON vault.',
  },
  { test: /need at least 2 share records/, hint: 'The NDJSON file must contain at least two share backup lines.' },
  { test: /prompt requires/, hint: 'Pass --tx \'<json>\', --from/--to/--value, or --digest <hex>.' },
  { test: /Invalid hex/, hint: 'Hex may start with 0x and must have an even number of 0-9a-f characters.' },
  { test: /--x must be a positive integer/, hint: 'Share indexes start at 1.' },
  { test: /--y <hex> is required/, hint: 'Pass the 32-byte share value as 64 hex characters.' },
  { test: /--out <file> is required/, hint: 'Choose a path to write the share backup JSON.' },
  { test: /rotate-shares requires/, hint: "Pass the old files with --files, plus --threshold, --total, and --out-dir for the new set." },
  {
    test: /audit-append requires --file/,
    hint: 'Pass --file path/to/decisions.jsonl. The file is created if missing and only appended.',
  },
  {
    test: /audit-append requires --kind/,
    hint: 'Use --kind policy-decision or --kind pre-sign.',
  },
  {
    test: /audit-append requires --outcome/,
    hint: 'Use --outcome allow or --outcome deny.',
  },
  {
    test: /audit-append --outcome deny requires --codes/,
    hint: 'Pass --codes with one or more reason codes, for example --codes limit-exceeded.',
  },
  { test: /audit-read requires --file/, hint: 'Pass --file path/to/decisions.jsonl to print the hash-chained log.' },
  { test: /--kind must be policy-decision/, hint: 'Use --kind policy-decision or --kind pre-sign.' },
  { test: /--outcome must be allow or deny/, hint: 'Use --outcome allow or --outcome deny.' },
  { test: /old shares are encrypted/, hint: 'Encrypt the new set with --new-password and --confirm-new-password, or opt out with --allow-plaintext.' },
  { test: /--file <path> is required/, hint: 'Pass --file path/to/share.json to read a backup.' },
  { test: /^unknown command:/, hint: 'Run mpc-toolkit help to list commands. Global flags: --json, --no-color, --log-level.' },
  { test: /log level must be one of/, hint: 'Use --log-level error, warn, info, or debug (or set MPC_LOG_LEVEL).' },
  { test: /iterations must be a positive integer/, hint: 'Pass --iterations with a count of 1 or more.' },
  { test: /requires an integer value/, hint: 'Pass a whole number after the flag, for example --iterations 25.' },
  { test: /requires a value/, hint: 'Pass a value after the flag, for example --threshold 2.' },
  {
    test: /password must be at least/,
    hint: 'Use at least 12 characters mixing lowercase, uppercase, digits, and symbols.',
  },
  {
    test: /password must mix at least/,
    hint: 'Mix at least three of: lowercase, uppercase, digits, symbols. Example: VaultShare-42.',
  },
  { test: /password is too common/, hint: 'Pick a unique passphrase; do not reuse a login password.' },
  {
    test: /password cannot be a single repeated character/,
    hint: 'Avoid runs like aaaaaaaa or 111111111111.',
  },
  {
    test: /password cannot be a sequential run/,
    hint: 'Avoid keyboard walks such as abcdefghijkl or 123456789012.',
  },
  {
    test: /password confirmation does not match/,
    hint: 'Re-type the same passphrase, or pass matching --password and --confirm-password values.',
  },
  {
    test: /--password requires --confirm-password/,
    hint: 'Pass --confirm-password with the same value, or run in a terminal to re-enter it.',
  },
];

const CODE_HINTS: Record<InputErrorCode, string> = {
  'invalid-type': 'Check the flag or field named in the error; the value has the wrong type.',
  'invalid-hex': 'Hex may start with 0x and must have an even number of 0-9a-f characters.',
  'invalid-length': 'Digests and share y values are 32 bytes (64 hex chars). Compressed public keys are 33 bytes.',
  'invalid-integer': 'Use a whole number with no decimal point, for example 2.',
  'invalid-json': 'Pass valid JSON. Share lists are arrays of { "x": <int>, "y": "<64-hex>" }.',
  'invalid-range': 'Share indexes and --total are at most 8; --threshold is at least 2.',
  'missing-value': 'Pass a value after the flag, for example --threshold 2.',
  duplicate: 'Each share index x must appear only once.',
  'too-few': 'Threshold combine needs at least two distinct shares or files.',
  'weak-passphrase':
    'Use at least 12 characters mixing lowercase, uppercase, digits, and symbols. Avoid common words.',
  mismatch: 'Re-type the same passphrase for --password and --confirm-password.',
};

function errorMeta(err: unknown): { code: string | null; field: string | null } {
  if (isInputError(err)) return { code: err.code, field: err.field ?? null };
  if (err instanceof SchemaError) return { code: err.code, field: null };
  return { code: null, field: null };
}

export function explainError(err: unknown): HelpfulError {
  const message = err instanceof Error && err.message ? err.message : String(err);
  const { code, field } = errorMeta(err);
  const extra: Pick<HelpfulError, 'code' | 'field'> = {};
  if (code) extra.code = code;
  if (field) extra.field = field;
  for (const row of HINTS) {
    if (row.test.test(message)) {
      return { message, hint: row.hint, ...extra };
    }
  }
  if (isInputError(err)) {
    return { message, hint: CODE_HINTS[err.code], ...extra };
  }
  return { message, ...extra };
}

export function formatErrorLines(err: unknown, opts?: { json?: boolean }): string {
  const explained = explainError(err);
  if (opts?.json) {
    return JSON.stringify({
      ok: false,
      error: explained.message,
      code: explained.code ?? null,
      field: explained.field ?? null,
      hint: explained.hint ?? null,
    });
  }
  const lines = [`error: ${explained.message}`];
  if (explained.hint) lines.push(`hint: ${explained.hint}`);
  return lines.join('\n');
}

export function renderCliError(err: unknown, opts: { json: boolean; color?: boolean }): string {
  if (opts.json) return formatErrorLines(err, { json: true });
  const explained = explainError(err);
  const paint = style(opts.color === true);
  const lines = [paint.red(`error: ${explained.message}`)];
  if (explained.hint) lines.push(paint.dim(`hint: ${explained.hint}`));
  return lines.join('\n');
}

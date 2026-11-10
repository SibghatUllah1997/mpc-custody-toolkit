/**
 * Map known CLI error messages to a short hint. Unknown errors still print
 * the original message; the hint is extra, never a substitute.
 */

import { style } from './color.js';

export type HelpfulError = {
  message: string;
  hint?: string;
};

const HINTS: Array<{ test: RegExp; hint: string }> = [
  { test: /Invalid JSON for --shares/, hint: 'Pass a JSON array of { "x": <int>, "y": "<64-hex>" } objects.' },
  { test: /Invalid JSON for --tx/, hint: 'Pass a JSON object with from, to, value, and optional data hex fields.' },
  { test: /--shares must be a JSON array of at least 2 shares/, hint: 'Threshold combine needs at least two distinct shares.' },
  { test: /need at least 2 files/, hint: 'Pass two or more comma-separated paths to --files.' },
  { test: /duplicate share x=/, hint: 'Each backup file must have a unique share index x.' },
  { test: /--threshold must be an integer >= 2/, hint: 'Use --threshold 2 (or higher) and --total at least that large.' },
  { test: /--total must be an integer >= --threshold/, hint: 'Raise --total so it is at least --threshold.' },
  { test: /--total must be an integer <=/, hint: 'This toolkit caps splits at 8 shares.' },
  { test: /--digest <hex> is required/, hint: 'Provide a 32-byte digest as 64 hex characters, with or without 0x.' },
  { test: /expected 32 bytes/, hint: 'Digests and share y values are 32 bytes (64 hex chars).' },
  { test: /does not match the expected public key/, hint: 'The shares reconstructed a different key than --pubkey.' },
  { test: /threshold-sign requires --shares/, hint: 'Pass --shares \'<json>\', --files a.json,b.json, or --stream vault.ndjson plus --digest.' },
  { test: /combine requires --shares/, hint: 'Pass --shares \'<json>\', --files a.json,b.json, or --stream vault.ndjson.' },
  { test: /need at least 2 share records/, hint: 'The NDJSON file must contain at least two share backup lines.' },
  { test: /prompt requires/, hint: 'Pass --tx \'<json>\', --from/--to/--value, or --digest <hex>.' },
  { test: /Invalid hex/, hint: 'Hex may start with 0x and must have an even number of 0-9a-f characters.' },
  { test: /--x must be a positive integer/, hint: 'Share indexes start at 1.' },
  { test: /--y <hex> is required/, hint: 'Pass the 32-byte share value as 64 hex characters.' },
  { test: /--out <file> is required/, hint: 'Choose a path to write the share backup JSON.' },
  { test: /--file <path> is required/, hint: 'Pass --file path/to/share.json to read a backup.' },
  { test: /^unknown command:/, hint: 'Run mpc-toolkit help to list commands. Global flags: --json, --no-color, --log-level.' },
  { test: /log level must be one of/, hint: 'Use --log-level error, warn, info, or debug (or set MPC_LOG_LEVEL).' },
];

export function explainError(err: unknown): HelpfulError {
  const message = err instanceof Error && err.message ? err.message : String(err);
  for (const row of HINTS) {
    if (row.test.test(message)) {
      return { message, hint: row.hint };
    }
  }
  return { message };
}

export function formatErrorLines(err: unknown, opts?: { json?: boolean }): string {
  const explained = explainError(err);
  if (opts?.json) {
    return JSON.stringify({ ok: false, error: explained.message, hint: explained.hint ?? null });
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

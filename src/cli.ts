#!/usr/bin/env node
// Note: import modules directly with .js extensions so the emitted CLI works under Node ESM.
import * as Secp256k1 from './crypto/secp256k1.js';
import * as Shamir from './sss/shamir.js';
import { bytesToHex, hexToBytes, normalizeHex } from './utils/bytes.js';
import { ShareEncoding, type DecodedShareBackup, type ShareSetInfo } from './encoding/share.js';
import {
  combineFromShareBackupNdjson,
  exportShareBackupNdjson,
  importShareBackupNdjson,
  sharesFromBackupStream,
} from './encoding/stream.js';
import { encryptString, decryptToString, isEncryptedEnvelope } from './encoding/encrypted.js';
import {
  setupThresholdKey,
  signWithShares,
} from './threshold/demo.js';
import { describeDigestSigning, describeSigningRequest } from './prompt/signing.js';
import type { Transaction } from './tx/types.js';
import { InputError } from './errors/input.js';
import { formatCliValue } from './ux/format.js';
import { renderCliError } from './ux/errors.js';
import { optionalFlagInt, optionalFlagString, parsePathList, requireFlagString } from './ux/flags.js';
import { wantsJson } from './ux/output.js';
import { wantsColor, type ColorMode } from './ux/color.js';
import { parseLogLevel } from './log/levels.js';
import { createLogger, type Logger } from './log/logger.js';
import { writeFile, readFile } from 'fs/promises';
import { formatBenchTable, runShamirBench, type ShamirBenchOptions } from './bench/index.js';
import { assertTagMatchesVersion, extractReleaseNotes, VERSION } from './release/index.js';

type ParsedArgs = {
  _: string[]; // positionals
  [key: string]: string | number | boolean | string[] | undefined;
};

// Export minimal helpers so tests can exercise file I/O logic without spawning a process.
export async function exportShareFile(
  share: { x: number; y: Uint8Array },
  outPath: string,
  opts?: { password?: string; set?: ShareSetInfo }
): Promise<void> {
  const json = ShareEncoding.encodeShare(share, opts?.set);
  const toWrite = opts?.password ? await encryptString(json, opts.password) : json;
  await writeFile(outPath, toWrite, { encoding: 'utf8', flag: 'w' });
}

export async function importShareBackupFile(
  path: string,
  opts?: { password?: string }
): Promise<DecodedShareBackup> {
  const raw = await readFile(path, { encoding: 'utf8' });
  const json = isEncryptedEnvelope(raw)
    ? await decryptToString(raw, opts?.password ?? '')
    : raw;
  return ShareEncoding.decodeShareBackup(json);
}

export async function importShareFile(
  path: string,
  opts?: { password?: string }
): Promise<{ x: number; y: Uint8Array }> {
  return (await importShareBackupFile(path, opts)).share;
}

export async function loadShareFiles(
  files: string[],
  opts?: { password?: string; minCount?: number }
): Promise<Shamir.Share[]> {
  const minCount = opts?.minCount ?? 2;
  if (!Array.isArray(files) || files.length < minCount) {
    throw new Error(`need at least ${minCount} files`);
  }
  const shares: Shamir.Share[] = [];
  const backups: DecodedShareBackup[] = [];
  const originByX = new Map<number, string>();
  for (const f of files) {
    const backup = await importShareBackupFile(f, { password: opts?.password });
    const s = backup.share;
    const prev = originByX.get(s.x);
    if (prev !== undefined) {
      throw new Error(`duplicate share x=${s.x} in ${prev} and ${f}`);
    }
    originByX.set(s.x, f);
    backups.push(backup);
    shares.push({ x: s.x, y: s.y });
  }
  ShareEncoding.assertCompatibleShareSet(backups);
  return shares;
}

export async function combineFromFiles(
  files: string[],
  opts?: { password?: string }
): Promise<Uint8Array> {
  const shares = await loadShareFiles(files, { password: opts?.password, minCount: 2 });
  return Shamir.combineShares(shares);
}

export async function exportSharesNdjson(
  shares: Shamir.Share[],
  outPath: string,
  opts?: { set?: ShareSetInfo }
): Promise<void> {
  await exportShareBackupNdjson(
    outPath,
    shares.map((share) => ({ share, set: opts?.set }))
  );
}

export async function importSharesNdjson(path: string): Promise<DecodedShareBackup[]> {
  return importShareBackupNdjson(path);
}

export async function loadSharesFromNdjson(
  path: string,
  opts?: { minCount?: number }
): Promise<Shamir.Share[]> {
  const backups = await importShareBackupNdjson(path);
  const minCount = opts?.minCount ?? 2;
  if (backups.length < minCount) {
    throw new Error(`need at least ${minCount} share records`);
  }
  return sharesFromBackupStream(backups);
}

export async function combineFromNdjson(path: string): Promise<Uint8Array> {
  return combineFromShareBackupNdjson(path);
}

export function parseShareJson(raw: string, opts?: { minCount?: number }): Shamir.Share[] {
  const minCount = opts?.minCount ?? 2;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new InputError('invalid-json', 'Invalid JSON for --shares', 'shares');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InputError('invalid-json', 'Invalid JSON for --shares', 'shares');
  }
  if (!Array.isArray(parsed) || parsed.length < minCount) {
    throw new InputError(
      'too-few',
      `--shares must be a JSON array of at least ${minCount} shares`,
      'shares'
    );
  }
  const seen = new Set<number>();
  return parsed.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new InputError('invalid-type', `--shares[${i}] must be an object`, `shares[${i}]`);
    }
    const rec = item as { x?: unknown; y?: unknown };
    if (!Number.isInteger(rec.x) || (rec.x as number) <= 0) {
      throw new InputError('invalid-integer', `--shares[${i}].x must be a positive integer`, `shares[${i}].x`);
    }
    const x = rec.x as number;
    if (x > Shamir.MAX_TOTAL_SHARES) {
      throw new InputError(
        'invalid-range',
        `--shares[${i}].x must be an integer in 1..${Shamir.MAX_TOTAL_SHARES}`,
        `shares[${i}].x`
      );
    }
    if (seen.has(x)) {
      throw new InputError('duplicate', `--shares: duplicate share x=${x}`, 'shares');
    }
    seen.add(x);
    if (typeof rec.y !== 'string') {
      throw new InputError('invalid-type', `--shares[${i}].y must be a hex string`, `shares[${i}].y`);
    }
    try {
      return { x, y: hexToBytes(rec.y, 32) };
    } catch (err) {
      if (err instanceof InputError) {
        throw new InputError(err.code, `--shares[${i}].y: ${err.message}`, `shares[${i}].y`);
      }
      throw err;
    }
  });
}

export function runThresholdSetup(opts?: { threshold?: number; total?: number }): {
  publicKey: string;
  threshold: number;
  total: number;
  shares: Array<{ x: number; y: string }>;
} {
  const threshold = opts?.threshold ?? 2;
  const total = opts?.total ?? 3;
  validateSplitArgs(threshold, total);
  const setup = setupThresholdKey({ threshold, total });
  return {
    publicKey: bytesToHex(setup.publicKey),
    threshold: setup.threshold,
    total: setup.total,
    shares: setup.shares.map((s) => ({ x: s.x, y: bytesToHex(s.y) })),
  };
}

export function parseTransactionJson(raw: string): Transaction {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new InputError('invalid-json', 'Invalid JSON for --tx', 'tx');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InputError('invalid-json', 'Invalid JSON for --tx', 'tx');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InputError('invalid-type', '--tx must be a JSON object', 'tx');
  }
  const rec = parsed as { from?: unknown; to?: unknown; value?: unknown; data?: unknown };
  if (typeof rec.from !== 'string' || typeof rec.to !== 'string' || typeof rec.value !== 'string') {
    throw new InputError('invalid-type', '--tx must include from, to, and value strings', 'tx');
  }
  return {
    from: rec.from,
    to: rec.to,
    value: rec.value,
    data: typeof rec.data === 'string' ? rec.data : '',
  };
}

export function runSigningPrompt(input: {
  tx?: Transaction;
  asset?: string;
  digestHex?: string;
  usedShareXs?: number[];
  publicKeyHex?: string;
}): { title: string; text: string; digestHex: string } {
  if (input.digestHex) {
    const prompt = describeDigestSigning({
      digestHex: input.digestHex,
      usedShareXs: input.usedShareXs,
      publicKeyHex: input.publicKeyHex,
    });
    return { title: prompt.title, text: prompt.text, digestHex: prompt.digestHex };
  }
  if (!input.tx) {
    throw new Error('prompt requires --tx <json>, --from/--to/--value, or --digest <hex>');
  }
  const prompt = describeSigningRequest({ tx: input.tx, asset: input.asset });
  return { title: prompt.title, text: prompt.text, digestHex: prompt.digestHex };
}

export function parseShareIndexList(raw: string | undefined): number[] | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') {
    throw new InputError('invalid-type', '--share-x must be a comma-separated list of positive integers', 'share-x');
  }
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new InputError('too-few', '--share-x must be a comma-separated list of positive integers', 'share-x');
  }
  const seen = new Set<number>();
  const xs: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) {
      throw new InputError('invalid-integer', '--share-x must be a comma-separated list of positive integers', 'share-x');
    }
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) {
      throw new InputError('invalid-integer', '--share-x must be a comma-separated list of positive integers', 'share-x');
    }
    if (n > Shamir.MAX_TOTAL_SHARES) {
      throw new InputError(
        'invalid-range',
        `--share-x values must be integers in 1..${Shamir.MAX_TOTAL_SHARES}`,
        'share-x'
      );
    }
    if (seen.has(n)) {
      throw new InputError('duplicate', `--share-x: duplicate index ${n}`, 'share-x');
    }
    seen.add(n);
    xs.push(n);
  }
  return xs;
}

export function runThresholdSign(input: {
  shares: Shamir.Share[];
  digestHex: string;
  publicKeyHex?: string;
}): {
  signature: string;
  publicKey: string;
  digest: string;
  usedShareXs: number[];
} {
  if (!input.digestHex) {
    throw new InputError('missing-value', '--digest <hex> is required', 'digest');
  }
  const digest = hexToBytes(input.digestHex, 32);
  const expected = input.publicKeyHex ? hexToBytes(input.publicKeyHex, 33) : undefined;
  const result = signWithShares(input.shares, digest, expected);
  return {
    signature: bytesToHex(result.signature),
    publicKey: bytesToHex(result.publicKey),
    digest: bytesToHex(result.digest),
    usedShareXs: result.usedShareXs,
  };
}

/** Optional `--set-id <hex16> --threshold <t> --total <n>` for export-share. */
export function parseShareSetArgs(args: ParsedArgs): ShareSetInfo | undefined {
  const id = optionalFlagString(args, 'set-id');
  if (id === undefined) return undefined;
  if (!/^[0-9a-fA-F]{16}$/.test(id)) {
    throw new InputError('invalid-hex', '--set-id must be 16 hex chars', 'set-id');
  }
  const threshold = optionalFlagInt(args, 'threshold', ['t']);
  const total = optionalFlagInt(args, 'total', ['n']);
  if (threshold === undefined || total === undefined) {
    throw new InputError('missing-value', '--set-id requires --threshold and --total', 'set-id');
  }
  validateSplitArgs(threshold, total);
  return { id: id.toLowerCase(), threshold, total };
}

export function parseBenchArgs(args: ParsedArgs): ShamirBenchOptions {
  return {
    iterations: optionalFlagInt(args, 'iterations', ['i']),
    warmup: optionalFlagInt(args, 'warmup'),
    threshold: optionalFlagInt(args, 'threshold', ['t']),
    total: optionalFlagInt(args, 'total', ['n']),
  };
}

export function runBench(opts?: ShamirBenchOptions) {
  return runShamirBench(opts);
}

export function validateSplitArgs(threshold: number, total: number): void {
  if (!Number.isInteger(threshold) || threshold < Shamir.MIN_THRESHOLD) {
    throw new InputError('invalid-integer', '--threshold must be an integer >= 2', 'threshold');
  }
  if (!Number.isInteger(total) || total < threshold) {
    throw new InputError('invalid-range', '--total must be an integer >= --threshold', 'total');
  }
  if (total > Shamir.MAX_TOTAL_SHARES) {
    throw new InputError(
      'invalid-range',
      `--total must be an integer <= ${Shamir.MAX_TOTAL_SHARES}`,
      'total'
    );
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else if (arg.startsWith('-')) {
      const key = arg.slice(1);
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(arg);
    }
  }
  return out;
}

export function cliColorMode(args: ParsedArgs): ColorMode {
  if (args['no-color'] === true || args['color'] === 'never' || args['color'] === false) return 'never';
  if (args['color'] === 'always' || args['color'] === true) return 'always';
  return 'auto';
}

export function emitCliResult(value: unknown, args: ParsedArgs): string {
  return formatCliValue(value, {
    json: wantsJson(args),
    color: wantsColor({ mode: cliColorMode(args) }) && !wantsJson(args),
  });
}

export function loggerFromArgs(args: ParsedArgs, sink?: (line: string) => void): Logger {
  const raw = args['log-level'] ?? args['logLevel'] ?? args['log'];
  if (raw === true) {
    throw new InputError('missing-value', '--log-level requires a value', 'log-level');
  }
  const level = typeof raw === 'string' ? parseLogLevel(raw) : undefined;
  return createLogger({ level, sink });
}

/**
 * Notes for one release. With `--tag`, the tag must equal `v<package version>`
 * so a mismatched tag fails before anything is published.
 */
export async function releaseNotesFromArgs(args: ParsedArgs): Promise<string> {
  const file = optionalFlagString(args, 'file') ?? 'docs/RELEASE_NOTES.md';
  const tag = optionalFlagString(args, 'tag');
  if (tag !== undefined) assertTagMatchesVersion(tag, VERSION);
  const markdown = await readFile(file, 'utf8');
  return extractReleaseNotes(markdown, VERSION);
}

function printUsage(): void {
  console.error('Usage:');
  console.error('  mpc-toolkit keygen [--json]');
  console.error("  mpc-toolkit split --secret <hex|0x...> --threshold <t> --total <n> [--json]");
  console.error("  mpc-toolkit combine --shares '[{\"x\":1,\"y\":\"<hex>\"}, ...]' [--json]");
  console.error('  mpc-toolkit export-share --x <n> --y <hex|0x...> --out <file> [--set-id <hex16> --threshold <t> --total <n>] [--password <pwd>] [--json]');
  console.error('  mpc-toolkit import-share --file <file> [--password <pwd>] [--json]');
  console.error("  mpc-toolkit combine --files 'a.json,b.json' [--password <pwd>] [--json]");
  console.error('  mpc-toolkit export-shares --shares \'<json>\' --out <file.ndjson> [--set-id <hex16> --threshold <t> --total <n>] [--json]');
  console.error('  mpc-toolkit import-shares --file <file.ndjson> [--json]');
  console.error('  mpc-toolkit combine --stream <file.ndjson> [--json]');
  console.error('  mpc-toolkit threshold-setup [--threshold <t>] [--total <n>] [--json]');
  console.error("  mpc-toolkit threshold-sign --shares '[{\"x\":1,\"y\":\"<hex>\"}, ...]' --digest <hex> [--pubkey <hex>] [--json]");
  console.error("  mpc-toolkit threshold-sign --files 'a.json,b.json' --digest <hex> [--pubkey <hex>] [--password <pwd>] [--json]");
  console.error('  mpc-toolkit threshold-sign --stream <file.ndjson> --digest <hex> [--pubkey <hex>] [--json]');
  console.error('  mpc-toolkit prompt --tx \'<json>\' [--asset <ticker>] [--json]');
  console.error('  mpc-toolkit prompt --from <hex> --to <hex> --value <n> [--data <hex>] [--asset <ticker>] [--json]');
  console.error('  mpc-toolkit prompt --digest <hex> [--share-x 1,2] [--pubkey <hex>] [--json]');
  console.error('  mpc-toolkit bench [--iterations <n>] [--threshold <t>] [--total <n>] [--warmup <n>] [--json]');
  console.error('  mpc-toolkit version [--json]');
  console.error('  mpc-toolkit release-notes [--tag v<version>] [--file docs/RELEASE_NOTES.md]');
  console.error('');
  console.error('Global flags: --json  --no-color  --log-level <error|warn|info|debug>  --help  --version');
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const log = loggerFromArgs(args);
  const [cmd] = args._;
  if (cmd) log.debug(`command ${cmd}`);

  if (cmd === 'version' || (!cmd && args['version'] === true)) {
    console.log(wantsJson(args) ? emitCliResult({ version: VERSION }, args) : VERSION);
    return;
  }

  if (cmd === 'release-notes') {
    process.stdout.write(await releaseNotesFromArgs(args));
    return;
  }

  if (!cmd || cmd === 'help' || args['help'] || args['h']) {
    printUsage();
    process.exit(cmd ? 0 : 1);
    return;
  }

  if (cmd === 'keygen') {
    const { privateKey, publicKey } = Secp256k1.generateKeyPair();
    const out = {
      privateKey: bytesToHex(privateKey),
      publicKey: bytesToHex(publicKey),
    };
    console.log(emitCliResult(out, args));
    return;
  }

  if (cmd === 'split') {
    const threshold = optionalFlagInt(args, 'threshold', ['t']) ?? 2;
    const total = optionalFlagInt(args, 'total', ['n']) ?? threshold;
    validateSplitArgs(threshold, total);
    let secretHex = optionalFlagString(args, 'secret');
    if (!secretHex) {
      const priv = Secp256k1.generatePrivateKey();
      secretHex = bytesToHex(priv);
    } else {
      normalizeHex(secretHex);
    }
    const shares = Shamir.splitSecret(secretHex, threshold, total);
    const json = shares.map((s) => ({ x: s.x, y: bytesToHex(s.y) }));
    console.log(emitCliResult(json, args));
    return;
  }

  if (cmd === 'combine') {
    const filesArg = optionalFlagString(args, 'files');
    const sharesArg = optionalFlagString(args, 'shares');
    const streamArg = optionalFlagString(args, 'stream');
    const password = optionalFlagString(args, 'password');
    if (streamArg) {
      const secret = await combineFromNdjson(streamArg);
      console.log(emitCliResult({ secret: bytesToHex(secret) }, args));
      return;
    } else if (filesArg) {
      const files = parsePathList(filesArg, { minCount: 2, flag: 'files' });
      const secret = await combineFromFiles(files, { password });
      console.log(emitCliResult({ secret: bytesToHex(secret) }, args));
      return;
    } else if (sharesArg) {
      const shares = parseShareJson(sharesArg);
      const secret = Shamir.combineShares(shares);
      console.log(emitCliResult({ secret: bytesToHex(secret) }, args));
      return;
    } else {
      throw new InputError(
        'missing-value',
        'combine requires --shares <json-array>, --files <paths>, or --stream <ndjson>',
        'shares'
      );
    }
  }

  if (cmd === 'threshold-setup') {
    const threshold = optionalFlagInt(args, 'threshold', ['t']) ?? 2;
    const total = optionalFlagInt(args, 'total', ['n']) ?? 3;
    const out = runThresholdSetup({ threshold, total });
    log.info(`issued ${out.total} shares with threshold ${out.threshold}`);
    console.log(emitCliResult(out, args));
    return;
  }

  if (cmd === 'threshold-sign') {
    const filesArg = optionalFlagString(args, 'files');
    const sharesArg = optionalFlagString(args, 'shares');
    const streamArg = optionalFlagString(args, 'stream');
    const digestHex = optionalFlagString(args, 'digest');
    const publicKeyHex = optionalFlagString(args, 'pubkey', ['public-key', 'publicKey']);
    const password = optionalFlagString(args, 'password');
    let shares: Shamir.Share[];
    if (streamArg) {
      shares = await loadSharesFromNdjson(streamArg, { minCount: 2 });
    } else if (filesArg) {
      const files = parsePathList(filesArg, { minCount: 2, flag: 'files' });
      shares = await loadShareFiles(files, { password, minCount: 2 });
    } else if (sharesArg) {
      shares = parseShareJson(sharesArg);
    } else {
      throw new InputError(
        'missing-value',
        'threshold-sign requires --shares <json-array>, --files <paths>, or --stream <ndjson>',
        'shares'
      );
    }
    const out = runThresholdSign({ shares, digestHex: digestHex ?? '', publicKeyHex });
    log.info(`signed digest with shares ${out.usedShareXs.join(',')}`);
    console.log(emitCliResult(out, args));
    return;
  }

  if (cmd === 'prompt') {
    const txArg = optionalFlagString(args, 'tx');
    const digestHex = optionalFlagString(args, 'digest');
    const asset = optionalFlagString(args, 'asset');
    const publicKeyHex = optionalFlagString(args, 'pubkey', ['public-key', 'publicKey']);
    const usedShareXs = parseShareIndexList(optionalFlagString(args, 'share-x'));
    let tx: Transaction | undefined;
    if (txArg) {
      tx = parseTransactionJson(txArg);
    } else if (args['from'] || args['to'] || args['value']) {
      const from = optionalFlagString(args, 'from');
      const to = optionalFlagString(args, 'to');
      const value = optionalFlagString(args, 'value');
      if (!from || !to || !value) {
        throw new InputError(
          'missing-value',
          'prompt requires --from, --to, and --value when not using --tx or --digest',
          'tx'
        );
      }
      tx = {
        from,
        to,
        value,
        data: optionalFlagString(args, 'data') ?? '',
      };
    }
    const out = runSigningPrompt({ tx, asset, digestHex, usedShareXs, publicKeyHex });
    console.log(wantsJson(args) ? JSON.stringify(out, null, 2) : out.text);
    return;
  }

  if (cmd === 'export-share') {
    const x = optionalFlagInt(args, 'x');
    const yHex = optionalFlagString(args, 'y');
    const out = optionalFlagString(args, 'out');
    const password = optionalFlagString(args, 'password');
    if (x === undefined || x <= 0) {
      throw new InputError('invalid-integer', '--x must be a positive integer', 'x');
    }
    if (x > Shamir.MAX_TOTAL_SHARES) {
      throw new InputError('invalid-range', `--x must be an integer in 1..${Shamir.MAX_TOTAL_SHARES}`, 'x');
    }
    if (!yHex) {
      throw new InputError('missing-value', '--y <hex> is required', 'y');
    }
    if (!out) {
      throw new InputError('missing-value', '--out <file> is required', 'out');
    }
    const y = hexToBytes(yHex, 32);
    const set = parseShareSetArgs(args);
    await exportShareFile({ x, y }, out, { password, set });
    console.log(emitCliResult({ ok: true, path: out }, args));
    return;
  }

  if (cmd === 'import-share') {
    const file = requireFlagString(args, 'file', { message: '--file <path> is required' });
    const password = optionalFlagString(args, 'password');
    const share = await importShareFile(file, { password });
    console.log(emitCliResult({ x: share.x, y: bytesToHex(share.y) }, args));
    return;
  }

  if (cmd === 'export-shares') {
    const sharesArg = requireFlagString(args, 'shares', { message: '--shares <json-array> is required' });
    const out = requireFlagString(args, 'out', { message: '--out <file> is required' });
    const shares = parseShareJson(sharesArg, { minCount: 1 });
    const set = parseShareSetArgs(args);
    await exportSharesNdjson(shares, out, { set });
    console.log(emitCliResult({ ok: true, path: out, count: shares.length }, args));
    return;
  }

  if (cmd === 'bench') {
    const opts = parseBenchArgs(args);
    const results = runBench(opts);
    log.info(`timed keygen/split/combine for ${results[0]?.iterations ?? 0} iterations`);
    console.log(wantsJson(args) ? emitCliResult({ results }, args) : formatBenchTable(results));
    return;
  }

  if (cmd === 'import-shares') {
    const file = requireFlagString(args, 'file', { message: '--file <path> is required' });
    const backups = await importSharesNdjson(file);
    console.log(
      emitCliResult(
        {
          count: backups.length,
          shares: backups.map((b) => ({
            x: b.share.x,
            y: bytesToHex(b.share.y),
            set: b.set,
          })),
        },
        args
      )
    );
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

// Execute only when run as a script (not when imported)
// In ESM, import.meta.url equals file URL of current module
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/cli.js')) {
  // eslint-disable-next-line no-floating-promises
  main().catch((err) => {
    const argv = process.argv.slice(2);
    const args = parseArgs(argv);
    const json = wantsJson(args);
    const color = !json && wantsColor({ mode: cliColorMode(args) });
    console.error(renderCliError(err, { json, color }));
    process.exit(1);
  });
}


#!/usr/bin/env node
// Note: import modules directly with .js extensions so the emitted CLI works under Node ESM.
import * as Secp256k1 from './crypto/secp256k1.js';
import * as Shamir from './sss/shamir.js';
import { bytesToHex, hexToBytes, normalizeHex } from './utils/bytes.js';
import { ShareEncoding } from './encoding/share.js';
import { encryptString, decryptToString, isEncryptedEnvelope } from './encoding/encrypted.js';
import {
  setupThresholdKey,
  signWithShares,
} from './threshold/demo.js';
import { describeDigestSigning, describeSigningRequest } from './prompt/signing.js';
import type { Transaction } from './tx/types.js';
import { writeFile, readFile } from 'fs/promises';

type ParsedArgs = {
  _: string[]; // positionals
  [key: string]: string | number | boolean | string[] | undefined;
};

// Export minimal helpers so tests can exercise file I/O logic without spawning a process.
export async function exportShareFile(
  share: { x: number; y: Uint8Array },
  outPath: string,
  opts?: { password?: string }
): Promise<void> {
  const json = ShareEncoding.encodeShare(share);
  const toWrite = opts?.password ? await encryptString(json, opts.password) : json;
  await writeFile(outPath, toWrite, { encoding: 'utf8', flag: 'w' });
}

export async function importShareFile(
  path: string,
  opts?: { password?: string }
): Promise<{ x: number; y: Uint8Array }> {
  const raw = await readFile(path, { encoding: 'utf8' });
  const json = isEncryptedEnvelope(raw)
    ? await decryptToString(raw, opts?.password ?? '')
    : raw;
  const share = ShareEncoding.decodeShare(json);
  return share;
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
  const originByX = new Map<number, string>();
  for (const f of files) {
    const s = await importShareFile(f, { password: opts?.password });
    const prev = originByX.get(s.x);
    if (prev !== undefined) {
      throw new Error(`duplicate share x=${s.x} in ${prev} and ${f}`);
    }
    originByX.set(s.x, f);
    shares.push({ x: s.x, y: s.y });
  }
  return shares;
}

export async function combineFromFiles(
  files: string[],
  opts?: { password?: string }
): Promise<Uint8Array> {
  const shares = await loadShareFiles(files, { password: opts?.password, minCount: 2 });
  return Shamir.combineShares(shares);
}

export function parseShareJson(raw: string): Shamir.Share[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON for --shares');
  }
  if (!Array.isArray(parsed) || parsed.length < 2) {
    throw new Error('--shares must be a JSON array of at least 2 shares');
  }
  return parsed.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`--shares[${i}] must be an object`);
    }
    const rec = item as { x?: unknown; y?: unknown };
    if (!Number.isInteger(rec.x) || (rec.x as number) <= 0) {
      throw new Error(`--shares[${i}].x must be a positive integer`);
    }
    if (typeof rec.y !== 'string') {
      throw new Error(`--shares[${i}].y must be a hex string`);
    }
    return { x: rec.x as number, y: hexToBytes(rec.y, 32) };
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON for --tx');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('--tx must be a JSON object');
  }
  const rec = parsed as { from?: unknown; to?: unknown; value?: unknown; data?: unknown };
  if (typeof rec.from !== 'string' || typeof rec.to !== 'string' || typeof rec.value !== 'string') {
    throw new Error('--tx must include from, to, and value strings');
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
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const xs = parts.map((p) => Number(p));
  if (xs.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new Error('--share-x must be a comma-separated list of positive integers');
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
    throw new Error('--digest <hex> is required');
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

export function validateSplitArgs(threshold: number, total: number): void {
  if (!Number.isInteger(threshold) || threshold < Shamir.MIN_THRESHOLD) {
    throw new Error('--threshold must be an integer >= 2');
  }
  if (!Number.isInteger(total) || total < threshold) {
    throw new Error('--total must be an integer >= --threshold');
  }
  if (total > Shamir.MAX_TOTAL_SHARES) {
    throw new Error(`--total must be an integer <= ${Shamir.MAX_TOTAL_SHARES}`);
  }
}

function parseArgs(argv: string[]): ParsedArgs {
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

function printUsage(): void {
  // Keep usage minimal for now; richer UX in a later roadmap item
  // mpc-toolkit keygen
  // mpc-toolkit split --secret <hex|0x...> --threshold <t> --total <n>
  // mpc-toolkit combine --shares '<json>'
  // mpc-toolkit export-share --x <n> --y <hex> --out <file> [--password <pwd>]
  // mpc-toolkit import-share --file <file> [--password <pwd>]
  // mpc-toolkit combine --files 'a.json,b.json' [--password <pwd>]
  console.error('Usage:');
  console.error('  mpc-toolkit keygen');
  console.error("  mpc-toolkit split --secret <hex|0x...> --threshold <t> --total <n>");
  console.error("  mpc-toolkit combine --shares '[{\"x\":1,\"y\":\"<hex>\"}, ...]'");
  console.error('  mpc-toolkit export-share --x <n> --y <hex|0x...> --out <file> [--password <pwd>]');
  console.error('  mpc-toolkit import-share --file <file> [--password <pwd>]');
  console.error("  mpc-toolkit combine --files 'a.json,b.json' [--password <pwd>]");
  console.error('  mpc-toolkit threshold-setup [--threshold <t>] [--total <n>]');
  console.error("  mpc-toolkit threshold-sign --shares '[{\"x\":1,\"y\":\"<hex>\"}, ...]' --digest <hex> [--pubkey <hex>]");
  console.error("  mpc-toolkit threshold-sign --files 'a.json,b.json' --digest <hex> [--pubkey <hex>] [--password <pwd>]");
  console.error('  mpc-toolkit prompt --tx \'<json>\' [--asset <ticker>]');
  console.error('  mpc-toolkit prompt --from <hex> --to <hex> --value <n> [--data <hex>] [--asset <ticker>]');
  console.error('  mpc-toolkit prompt --digest <hex> [--share-x 1,2] [--pubkey <hex>]');
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const [cmd] = args._;

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
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === 'split') {
    const threshold = Number(args['threshold'] ?? args['t'] ?? 2);
    const total = Number(args['total'] ?? args['n'] ?? threshold);
    validateSplitArgs(threshold, total);
    let secretHex = args['secret'] as string | undefined;
    if (!secretHex) {
      // Random new secret if not provided
      const priv = Secp256k1.generatePrivateKey();
      secretHex = bytesToHex(priv);
    } else {
      // normalize or throw if invalid
      normalizeHex(secretHex);
    }
    const shares = Shamir.splitSecret(secretHex, threshold, total);
    const json = shares.map(s => ({ x: s.x, y: bytesToHex(s.y) }));
    console.log(JSON.stringify(json, null, 2));
    return;
  }

  if (cmd === 'combine') {
    const filesArg = args['files'] as string | undefined;
    const sharesArg = args['shares'] as string | undefined;
    const password = args['password'] as string | undefined;
    if (filesArg) {
      const files = filesArg.split(',').map(s => s.trim()).filter(Boolean);
      const secret = await combineFromFiles(files, { password });
      console.log(JSON.stringify({ secret: bytesToHex(secret) }, null, 2));
      return;
    } else if (sharesArg) {
      const shares = parseShareJson(sharesArg);
      const secret = Shamir.combineShares(shares);
      console.log(JSON.stringify({ secret: bytesToHex(secret) }, null, 2));
      return;
    } else {
      throw new Error('combine requires either --shares <json-array> or --files <comma-separated-paths>');
    }
  }

  if (cmd === 'threshold-setup') {
    const threshold = Number(args['threshold'] ?? args['t'] ?? 2);
    const total = Number(args['total'] ?? args['n'] ?? 3);
    const out = runThresholdSetup({ threshold, total });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === 'threshold-sign') {
    const filesArg = args['files'] as string | undefined;
    const sharesArg = args['shares'] as string | undefined;
    const digestHex = args['digest'] as string | undefined;
    const publicKeyHex = (args['pubkey'] ?? args['public-key'] ?? args['publicKey']) as string | undefined;
    const password = args['password'] as string | undefined;
    let shares: Shamir.Share[];
    if (filesArg) {
      const files = filesArg.split(',').map((s) => s.trim()).filter(Boolean);
      shares = await loadShareFiles(files, { password, minCount: 2 });
    } else if (sharesArg) {
      shares = parseShareJson(sharesArg);
    } else {
      throw new Error('threshold-sign requires either --shares <json-array> or --files <comma-separated-paths>');
    }
    const out = runThresholdSign({ shares, digestHex: digestHex ?? '', publicKeyHex });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === 'prompt') {
    const txArg = args['tx'] as string | undefined;
    const digestHex = args['digest'] as string | undefined;
    const asset = args['asset'] as string | undefined;
    const publicKeyHex = (args['pubkey'] ?? args['public-key'] ?? args['publicKey']) as string | undefined;
    const usedShareXs = parseShareIndexList(args['share-x'] as string | undefined);
    let tx: Transaction | undefined;
    if (txArg) {
      tx = parseTransactionJson(txArg);
    } else if (args['from'] || args['to'] || args['value']) {
      const from = args['from'] as string | undefined;
      const to = args['to'] as string | undefined;
      const value = args['value'] as string | undefined;
      if (!from || !to || !value) {
        throw new Error('prompt requires --from, --to, and --value when not using --tx or --digest');
      }
      tx = {
        from,
        to,
        value,
        data: typeof args['data'] === 'string' ? (args['data'] as string) : '',
      };
    }
    const out = runSigningPrompt({ tx, asset, digestHex, usedShareXs, publicKeyHex });
    console.log(out.text);
    return;
  }

  if (cmd === 'export-share') {
    const x = Number(args['x']);
    const yHex = args['y'] as string | undefined;
    const out = args['out'] as string | undefined;
    const password = args['password'] as string | undefined;
    if (!Number.isInteger(x) || x <= 0) {
      throw new Error('--x must be a positive integer');
    }
    if (!yHex) {
      throw new Error('--y <hex> is required');
    }
    if (!out) {
      throw new Error('--out <file> is required');
    }
    const y = hexToBytes(yHex, 32);
    await exportShareFile({ x, y }, out, { password });
    console.log(JSON.stringify({ ok: true, path: out }, null, 2));
    return;
  }

  if (cmd === 'import-share') {
    const file = args['file'] as string | undefined;
    const password = args['password'] as string | undefined;
    if (!file) {
      throw new Error('--file <path> is required');
    }
    const share = await importShareFile(file, { password });
    console.log(JSON.stringify({ x: share.x, y: bytesToHex(share.y) }, null, 2));
    return;
  }

  printUsage();
  process.exit(1);
}

// Execute only when run as a script (not when imported)
// In ESM, import.meta.url equals file URL of current module
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('/cli.js')) {
  // eslint-disable-next-line no-floating-promises
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}


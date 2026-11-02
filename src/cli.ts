#!/usr/bin/env node
// Note: import modules directly with .js extensions so the emitted CLI works under Node ESM.
import * as Secp256k1 from './crypto/secp256k1.js';
import * as Shamir from './sss/shamir.js';
import { bytesToHex, hexToBytes, normalizeHex } from './utils/bytes.js';
import { ShareEncoding } from './encoding/share.js';
import { encryptString, decryptToString, isEncryptedEnvelope } from './encoding/encrypted.js';
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
  console.error('Usage:');
  console.error('  mpc-toolkit keygen');
  console.error("  mpc-toolkit split --secret <hex|0x...> --threshold <t> --total <n>");
  console.error("  mpc-toolkit combine --shares '[{\"x\":1,\"y\":\"<hex>\"}, ...]'");
  console.error('  mpc-toolkit export-share --x <n> --y <hex|0x...> --out <file> [--password <pwd>]');
  console.error('  mpc-toolkit import-share --file <file> [--password <pwd>]');
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
    const sharesArg = args['shares'];
    if (typeof sharesArg !== 'string') {
      throw new Error('combine requires --shares <json-array>');
    }
    let parsed: Array<{ x: number; y: string }>;
    try {
      parsed = JSON.parse(sharesArg);
    } catch {
      throw new Error('Invalid JSON for --shares');
    }
    const shares = parsed.map(s => ({ x: s.x, y: hexToBytes(s.y, 32) }));
    const secret = Shamir.combineShares(shares);
    console.log(JSON.stringify({ secret: bytesToHex(secret) }, null, 2));
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


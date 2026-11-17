/**
 * Local passphrase checks for encrypted share export.
 * Heuristics only: they catch empty, tiny, common, and one-class secrets.
 * They are not a password manager and do not rate real-world guessability.
 */

import { InputError } from '../errors/input.js';

/** Shortest passphrase accepted for a new encrypted backup. */
export const MIN_PASSPHRASE_LENGTH = 12;
/** Distinct character classes required (lowercase, uppercase, digit, symbol). */
export const MIN_PASSPHRASE_CLASSES = 3;

export type PassphraseClass = 'lower' | 'upper' | 'digit' | 'symbol';

export type PassphraseAnalysis = {
  length: number;
  classes: PassphraseClass[];
  classCount: number;
  /** 0–1 fail, 2 acceptable, 3–4 stronger. */
  score: 0 | 1 | 2 | 3 | 4;
  ok: boolean;
  reasons: string[];
};

const CLASS_ORDER: readonly PassphraseClass[] = ['lower', 'upper', 'digit', 'symbol'];

/** Tiny denylist of obvious passphrases, stored lowercase with spaces stripped. */
const COMMON_PASSPHRASES = new Set([
  'password',
  'password123',
  'password1234',
  'passphrase',
  'passphrase1',
  'passphrase12',
  '123456789012',
  'qwertyuiopas',
  'qwertyuiop',
  'letmein12345',
  'adminadmin12',
  'secretsecret',
  'iloveyou1234',
  'abcdefghijkl',
  'mpctoolkit12',
  'changeme1234',
  'welcome12345',
]);

function classifyChar(ch: string): PassphraseClass | undefined {
  if (ch >= 'a' && ch <= 'z') return 'lower';
  if (ch >= 'A' && ch <= 'Z') return 'upper';
  if (ch >= '0' && ch <= '9') return 'digit';
  if (ch.trim() !== '') return 'symbol';
  return undefined;
}

function isRepeated(password: string): boolean {
  return password.length > 1 && password.split('').every((ch) => ch === password[0]);
}

/** True when eight or more neighboring characters step by one code point. */
function isSequential(password: string): boolean {
  const s = password.toLowerCase();
  if (s.length < 8) return false;
  let run = 1;
  let dir = 0;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d === 1 || d === -1) {
      if (dir === d) run += 1;
      else {
        dir = d;
        run = 2;
      }
      if (run >= 8) return true;
    } else {
      dir = 0;
      run = 1;
    }
  }
  return false;
}

function scoreOf(length: number, classCount: number, failed: boolean): 0 | 1 | 2 | 3 | 4 {
  if (length === 0) return 0;
  if (failed) return length < 8 ? 0 : 1;
  if (length >= 16 && classCount >= 4) return 4;
  if (length >= 16 && classCount >= 3) return 3;
  if (length >= MIN_PASSPHRASE_LENGTH && classCount >= MIN_PASSPHRASE_CLASSES) return 2;
  return length >= 8 ? 1 : 0;
}

/** Inspect a passphrase without throwing. Unknown types are treated as empty. */
export function analyzePassphrase(password: unknown): PassphraseAnalysis {
  const reasons: string[] = [];
  if (typeof password !== 'string') {
    return {
      length: 0,
      classes: [],
      classCount: 0,
      score: 0,
      ok: false,
      reasons: ['password must be a string'],
    };
  }

  const classSet = new Set<PassphraseClass>();
  for (const ch of password) {
    const kind = classifyChar(ch);
    if (kind) classSet.add(kind);
  }
  const classes = CLASS_ORDER.filter((c) => classSet.has(c));
  const classCount = classes.length;
  const normalized = password.toLowerCase().replace(/\s+/g, '');

  if (password.length === 0) reasons.push('password is required');
  else if (password.length < MIN_PASSPHRASE_LENGTH) {
    reasons.push(`password must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  }
  if (password.length > 0 && classCount < MIN_PASSPHRASE_CLASSES) {
    reasons.push(
      `password must mix at least ${MIN_PASSPHRASE_CLASSES} of: lowercase, uppercase, digits, symbols`
    );
  }
  if (normalized.length > 0 && COMMON_PASSPHRASES.has(normalized)) {
    reasons.push('password is too common');
  }
  if (isRepeated(password)) reasons.push('password cannot be a single repeated character');
  if (isSequential(password)) reasons.push('password cannot be a sequential run of characters');

  const failed = reasons.length > 0;
  const score = scoreOf(password.length, classCount, failed);
  return {
    length: password.length,
    classes,
    classCount,
    score,
    ok: !failed && score >= 2,
    reasons,
  };
}

/** Throw `weak-passphrase` when the password would be rejected for a new encrypted backup. */
export function assertPassphraseStrength(password: string, field = 'password'): void {
  const result = analyzePassphrase(password);
  if (!result.ok) {
    throw new InputError('weak-passphrase', result.reasons[0] ?? 'password is too weak', field);
  }
}

/** Throw `mismatch` when the confirmation is missing or differs. */
export function assertPassphraseConfirmation(
  password: string,
  confirmation: string,
  field = 'confirm-password'
): void {
  if (typeof confirmation !== 'string' || confirmation !== password) {
    throw new InputError('mismatch', 'password confirmation does not match', field);
  }
}

export type PassphrasePrompt = (question: string) => Promise<string>;

export const CONFIRM_PASSWORD_PROMPT = 'Re-enter password: ';

/**
 * Confirm and strength-check a password before wrapping a share backup.
 * When `confirmation` is omitted, `prompt` is used (TTY). Non-interactive
 * callers must pass `--confirm-password` instead.
 */
export async function resolveExportPassphrase(opts: {
  password: string;
  confirmation?: string;
  prompt?: PassphrasePrompt;
}): Promise<string> {
  if (!opts || typeof opts !== 'object' || Array.isArray(opts)) {
    throw new InputError('invalid-type', 'export passphrase options must be an object', 'password');
  }
  const password = opts.password;
  if (typeof password !== 'string' || password.length === 0) {
    throw new InputError('missing-value', 'password is required', 'password');
  }
  let confirmation = opts.confirmation;
  if (confirmation === undefined) {
    if (!opts.prompt) {
      throw new InputError(
        'missing-value',
        '--password requires --confirm-password',
        'confirm-password'
      );
    }
    confirmation = await opts.prompt(CONFIRM_PASSWORD_PROMPT);
  }
  assertPassphraseConfirmation(password, confirmation);
  assertPassphraseStrength(password);
  return password;
}

/**
 * Tiny ANSI helpers. Colors are skipped when NO_COLOR is set, when FORCE_COLOR
 * is "0", or when stdout is not a TTY (unless FORCE_COLOR is a positive value).
 */

const RESET = '\u001b[0m';
const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const RED = '\u001b[31m';
const GREEN = '\u001b[32m';
const YELLOW = '\u001b[33m';
const CYAN = '\u001b[36m';

export type ColorMode = 'auto' | 'always' | 'never';

export function wantsColor(opts?: { stdoutTty?: boolean; env?: NodeJS.ProcessEnv; mode?: ColorMode }): boolean {
  const env = opts?.env ?? process.env;
  const mode = opts?.mode ?? 'auto';
  if (mode === 'never') return false;
  if (mode === 'always') return true;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR === '0') return false;
  if (env.FORCE_COLOR && env.FORCE_COLOR !== '0') return true;
  return opts?.stdoutTty ?? Boolean(process.stdout.isTTY);
}

function paint(enabled: boolean, code: string, text: string): string {
  if (!enabled || text === '') return text;
  return `${code}${text}${RESET}`;
}

export function style(enabled: boolean) {
  return {
    bold: (text: string) => paint(enabled, BOLD, text),
    dim: (text: string) => paint(enabled, DIM, text),
    red: (text: string) => paint(enabled, RED, text),
    green: (text: string) => paint(enabled, GREEN, text),
    yellow: (text: string) => paint(enabled, YELLOW, text),
    cyan: (text: string) => paint(enabled, CYAN, text),
  };
}

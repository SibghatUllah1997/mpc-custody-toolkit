export type FlagMap = {
  [key: string]: string | number | boolean | string[] | undefined;
};

/**
 * `--json` requests machine-readable stdout. Human text is the default.
 * JSON errors still go to stderr so a pipe of stdout stays empty on failure.
 */
export function wantsJson(args: FlagMap): boolean {
  return args['json'] === true || args['json'] === 'true' || args['json'] === '1';
}

export function printJson(value: unknown, write: (line: string) => void = console.log): void {
  write(JSON.stringify(value, null, 2));
}

export function printHuman(text: string, write: (line: string) => void = console.log): void {
  write(text);
}

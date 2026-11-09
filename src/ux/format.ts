import { style } from './color.js';

function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

function isShareRow(value: unknown): value is { x: number; y: string } {
  return (
    !!value &&
    typeof value === 'object' &&
    Number.isInteger((value as { x?: unknown }).x) &&
    typeof (value as { y?: unknown }).y === 'string'
  );
}

/**
 * Flatten a JSON-shaped CLI result into labeled lines for a person to read.
 */
export function formatHumanValue(value: unknown, colorEnabled = false): string {
  const paint = style(colorEnabled);
  const lines: string[] = [];

  const push = (label: string, text: string, indent = 0): void => {
    const pad = '  '.repeat(indent);
    lines.push(`${pad}${paint.cyan(label.padEnd(12))} ${text}`);
  };

  if (Array.isArray(value)) {
    if (value.every(isShareRow)) {
      for (const row of value) push(`share ${row.x}`, row.y);
      return lines.join('\n');
    }
    return value.map((item, i) => formatHumanValue({ index: i, value: item }, colorEnabled)).join('\n');
  }

  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    for (const [key, item] of Object.entries(rec)) {
      if (Array.isArray(item) && item.every(isShareRow)) {
        for (const row of item) push(`share ${row.x}`, row.y);
        continue;
      }
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        push(humanizeKey(key), '');
        const nested = formatHumanValue(item, colorEnabled)
          .split('\n')
          .map((line) => `  ${line}`);
        lines.push(...nested);
        continue;
      }
      push(humanizeKey(key), item === undefined || item === null ? '' : String(item));
    }
    return lines.join('\n');
  }

  return String(value);
}

export function formatCliValue(value: unknown, opts: { json: boolean; color?: boolean }): string {
  if (opts.json) return JSON.stringify(value, null, 2);
  return formatHumanValue(value, opts.color === true);
}

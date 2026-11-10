import { describe, expect, it } from 'vitest';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createNdjsonSplitter, DEFAULT_MAX_NDJSON_LINE_BYTES } from '../src/encoding/ndjson';

async function collectLines(
  chunks: Array<string | Buffer>,
  opts?: { maxLineBytes?: number }
): Promise<string[]> {
  const lines: string[] = [];
  const splitter = createNdjsonSplitter(opts);
  splitter.on('data', (line: string) => lines.push(line));
  await pipeline(Readable.from(chunks), splitter);
  return lines;
}

describe('createNdjsonSplitter', () => {
  it('emits non-empty lines and accepts a missing trailing newline', async () => {
    const lines = await collectLines(['{"a":1}\n{"b":2}\n{"c":3}']);
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it('skips blank lines and treats CRLF as a line break', async () => {
    const lines = await collectLines(['one\r\n\n  \r\n two\r\n']);
    expect(lines).toEqual(['one', ' two']);
  });

  it('reassembles a record split across byte chunks', async () => {
    const record = '{"x":1,"y":"abcd"}';
    const mid = 7;
    const lines = await collectLines([
      Buffer.from(record.slice(0, mid), 'utf8'),
      Buffer.from(record.slice(mid) + '\n{"ok":true}\n', 'utf8'),
    ]);
    expect(lines).toEqual([record, '{"ok":true}']);
  });

  it('rejects a line longer than the configured cap', async () => {
    await expect(collectLines(['abcde'], { maxLineBytes: 4 })).rejects.toThrow(
      /NDJSON line exceeds 4 bytes/
    );
    await expect(collectLines(['abcd\n' + 'x'.repeat(5)], { maxLineBytes: 4 })).rejects.toThrow(
      /NDJSON line exceeds 4 bytes/
    );
  });

  it('exposes a default cap large enough for a share backup record', () => {
    expect(DEFAULT_MAX_NDJSON_LINE_BYTES).toBe(65_536);
  });
});

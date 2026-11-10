import { Transform } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

/** Default cap on one NDJSON record so a missing newline cannot grow without bound. */
export const DEFAULT_MAX_NDJSON_LINE_BYTES = 65_536;

export type NdjsonSplitterOptions = {
  /** Reject a single line (including an unfinished last line) longer than this. */
  maxLineBytes?: number;
};

function lineTooLong(maxLineBytes: number): Error {
  return new Error(`NDJSON line exceeds ${maxLineBytes} bytes`);
}

/**
 * Split a UTF-8 byte stream into NDJSON records (one string per non-empty line).
 * `\n` and `\r\n` are both accepted. Blank lines are skipped. The last line
 * does not need a trailing newline.
 */
export function createNdjsonSplitter(options?: NdjsonSplitterOptions): Transform {
  const maxLineBytes = options?.maxLineBytes ?? DEFAULT_MAX_NDJSON_LINE_BYTES;
  const decoder = new StringDecoder('utf8');
  let pending = '';

  function emitCompleteLines(stream: Transform): void {
    for (;;) {
      const nl = pending.indexOf('\n');
      if (nl < 0) break;
      let line = pending.slice(0, nl);
      pending = pending.slice(nl + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.trim().length > 0) stream.push(line);
    }
  }

  return new Transform({
    readableObjectMode: true,
    transform(chunk, _encoding, callback) {
      pending += typeof chunk === 'string' ? chunk : decoder.write(chunk as Buffer);
      emitCompleteLines(this);
      if (pending.length > maxLineBytes) {
        callback(lineTooLong(maxLineBytes));
        return;
      }
      callback();
    },
    flush(callback) {
      pending += decoder.end();
      emitCompleteLines(this);
      if (pending.length > maxLineBytes) {
        callback(lineTooLong(maxLineBytes));
        return;
      }
      if (pending.trim().length > 0) this.push(pending);
      pending = '';
      callback();
    },
  });
}

import { describe, expect, it } from 'vitest';
import {
  LOG_LEVEL_ENV,
  createLogger,
  levelEnabled,
  parseLogLevel,
  resolveLogLevel,
} from '../src/log';

describe('parseLogLevel / resolveLogLevel', () => {
  it('accepts the four level names, ignoring case and surrounding space', () => {
    expect(parseLogLevel(' DEBUG ')).toBe('debug');
    expect(parseLogLevel('Warn')).toBe('warn');
    expect(parseLogLevel(undefined)).toBe('info');
    expect(() => parseLogLevel('verbose')).toThrow(/log level must be one of/);
  });

  it('reads MPC_LOG_LEVEL unless an explicit level is passed', () => {
    expect(resolveLogLevel({ env: { [LOG_LEVEL_ENV]: 'debug' } })).toBe('debug');
    expect(resolveLogLevel({ env: { [LOG_LEVEL_ENV]: '' } })).toBe('info');
    expect(resolveLogLevel({ level: 'error', env: { [LOG_LEVEL_ENV]: 'debug' } })).toBe('error');
  });
});

describe('createLogger', () => {
  it('writes error and warn at the warn level, but not info or debug', () => {
    const lines: string[] = [];
    const log = createLogger({ level: 'warn', sink: (line) => lines.push(line) });
    log.error('boom');
    log.warn('careful');
    log.info('hello');
    log.debug('trace');
    expect(lines).toEqual(['error: boom', 'warn: careful']);
    expect(log.level).toBe('warn');
  });

  it('writes every level at debug and can omit the prefix', () => {
    const lines: string[] = [];
    const log = createLogger({
      level: 'debug',
      prefix: false,
      sink: (line) => lines.push(line),
    });
    log.debug('peek');
    log.info('ok');
    expect(lines).toEqual(['peek', 'ok']);
  });

  it('treats error as the quietest level', () => {
    expect(levelEnabled('error', 'error')).toBe(true);
    expect(levelEnabled('error', 'warn')).toBe(false);
    expect(levelEnabled('debug', 'info')).toBe(true);
  });
});

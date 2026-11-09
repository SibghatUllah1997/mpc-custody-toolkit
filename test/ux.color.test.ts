import { describe, expect, it } from 'vitest';
import { style, wantsColor } from '../src/ux/color';

describe('wantsColor', () => {
  it('follows NO_COLOR and FORCE_COLOR over TTY detection', () => {
    expect(wantsColor({ stdoutTty: true, env: { NO_COLOR: '1' }, mode: 'auto' })).toBe(false);
    expect(wantsColor({ stdoutTty: false, env: { FORCE_COLOR: '1' }, mode: 'auto' })).toBe(true);
    expect(wantsColor({ stdoutTty: true, env: { FORCE_COLOR: '0' }, mode: 'auto' })).toBe(false);
    expect(wantsColor({ stdoutTty: false, env: {}, mode: 'auto' })).toBe(false);
    expect(wantsColor({ stdoutTty: true, env: {}, mode: 'auto' })).toBe(true);
  });

  it('honors explicit always/never modes', () => {
    expect(wantsColor({ stdoutTty: false, env: { NO_COLOR: '1' }, mode: 'always' })).toBe(true);
    expect(wantsColor({ stdoutTty: true, env: { FORCE_COLOR: '1' }, mode: 'never' })).toBe(false);
  });
});

describe('style', () => {
  it('wraps text in ANSI codes only when enabled', () => {
    const on = style(true);
    const off = style(false);
    expect(on.red('fail')).toMatch(/^\u001b\[31mfail\u001b\[0m$/);
    expect(on.cyan('label')).toContain('\u001b[36m');
    expect(off.red('fail')).toBe('fail');
    expect(off.bold('x')).toBe('x');
    expect(on.red('')).toBe('');
  });
});

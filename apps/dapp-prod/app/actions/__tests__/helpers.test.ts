import { describe, expect, it } from 'vitest';
import BN from 'bn.js';
import { uiToBn } from '../helpers';

describe('uiToBn', () => {
  it('converts integer inputs', () => {
    const result = uiToBn('10', 6);
    expect(result.eq(new BN('10000000'))).toBe(true);
  });

  it('converts decimal inputs with padding', () => {
    const result = uiToBn('1.23', 6);
    expect(result.eq(new BN('1230000'))).toBe(true);
  });

  it('trims whitespace', () => {
    const result = uiToBn(' 0.5 ', 3);
    expect(result.eq(new BN('500'))).toBe(true);
  });

  it('throws on too many decimals', () => {
    expect(() => uiToBn('0.1234', 3)).toThrow();
  });

  it('throws on zero when not allowed', () => {
    expect(() => uiToBn('0', 6)).toThrow();
  });

  it('allows zero when configured', () => {
    const result = uiToBn('0', 6, { allowZero: true });
    expect(result.isZero()).toBe(true);
  });
});

import { describe, expect, it } from 'vitest'
import { formatInput, formatNumber, formatOperand } from './format'

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [-0, '0'],
    [7, '7'],
    [-42, '-42'],
    [1234567, '1,234,567'],
    [0.25, '0.25'],
    [0.1 + 0.2, '0.3'],
    [1.1 * 1.1, '1.21'],
    [1 / 3, '0.333333333333333'],
    [-1234.5, '-1,234.5'],
    [999_999_999_999_999, '999,999,999,999,999'],
    [0.000001, '0.000001'],
  ])('formats %d as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected)
  })

  it.each([
    [1e15, '1e+15'],
    [1.5e21, '1.5e+21'],
    [-2.5e300, '-2.5e+300'],
    [1e-7, '1e-7'],
    [1.23456789e-10, '1.23456789e-10'],
    [2 ** 64, '1.84467440737096e+19'],
  ])('uses exponential notation for %d', (value, expected) => {
    expect(formatNumber(value)).toBe(expected)
  })

  it('never renders NaN or Infinity', () => {
    expect(formatNumber(Number.NaN)).toBe('Error')
    expect(formatNumber(Infinity)).toBe('Error')
  })
})

describe('formatInput', () => {
  it.each([
    ['0', '0'],
    ['-0', '-0'],
    ['0.', '0.'],
    ['12.50', '12.50'],
    ['1234567.0001', '1,234,567.0001'],
    ['-9876543', '-9,876,543'],
    ['.5', '0.5'],
  ])('formats %s as %s', (text, expected) => {
    expect(formatInput(text)).toBe(expected)
  })

  it('leaves unrecognised text untouched', () => {
    expect(formatInput('abc')).toBe('abc')
  })
})

describe('formatOperand', () => {
  it('wraps negative numbers in parentheses', () => {
    expect(formatOperand(-3)).toBe('(-3)')
    expect(formatOperand(3)).toBe('3')
  })
})

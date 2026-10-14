import { describe, expect, it } from 'vitest'
import { decimalExponent, formatInput, formatNumber, formatOperand, negate } from './format'

describe('formatNumber', () => {
  it.each([
    ['0', '0'],
    ['-0', '0'],
    ['0.000', '0'],
    ['7', '7'],
    ['-42', '-42'],
    ['1234567', '1,234,567'],
    ['0.25', '0.25'],
    ['12.50', '12.5'],
    ['-1234.5', '-1,234.5'],
    ['0.000001', '0.000001'],
    ['9007199254740993', '9,007,199,254,740,993'],
    ['12345678901234567890', '12,345,678,901,234,567,890'],
    ['0.3333333333333333333333333333333333', '0.33333333333333333333'],
    ['1.414213562373095048801688724209698', '1.4142135623730950488'],
    ['0.6666666666666666666666666666666667', '0.66666666666666666667'],
    ['0.9999999999999999999999999999999999', '1'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected)
  })

  it.each([
    ['1e+20', '1e+20'],
    ['123456789012345678901234567890', '1.234567890123456789e+29'],
    ['99999999999999999999999', '1e+23'],
    ['1.5e+40', '1.5e+40'],
    ['-2.5e+300', '-2.5e+300'],
    ['1e-7', '1e-7'],
    ['0.000000123456789', '1.23456789e-7'],
    ['9.99e+6144', '9.99e+6144'],
    ['-1.25e-6143', '-1.25e-6143'],
    ['1e+400', '1e+400'],
  ])('uses scientific notation for %s', (value, expected) => {
    expect(formatNumber(value)).toBe(expected)
  })

  it.each(['NaN', 'Infinity', '', '-', 'abc', '1,000'])(
    'renders invalid input %j as Error',
    (value) => {
      expect(formatNumber(value)).toBe('Error')
    },
  )
})

describe('decimalExponent', () => {
  it.each([
    ['1234', 3],
    ['1', 0],
    ['0.05', -2],
    ['-0.5', -1],
    ['001.5', 0],
    ['1.5e40', 40],
    ['0.012e-3', -5],
    ['.5', -1],
  ])('of %s is %d', (value, expected) => {
    expect(decimalExponent(value)).toBe(expected)
  })

  it.each(['0', '0.000', '-0', 'abc'])('of %s is null', (value) => {
    expect(decimalExponent(value)).toBeNull()
  })
})

describe('negate', () => {
  it.each([
    ['5', '-5'],
    ['-5', '5'],
    ['0.1', '-0.1'],
    ['1e+40', '-1e+40'],
    ['0', '0'],
  ])('negates %s to %s', (value, expected) => {
    expect(negate(value)).toBe(expected)
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
    expect(formatOperand('-3')).toBe('(-3)')
    expect(formatOperand('3')).toBe('3')
  })
})

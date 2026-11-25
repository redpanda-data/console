import { clampNumber, isNonzeroNumber, lerpNumber, nonzeroNumber } from './number-utils';
import { compareStrings, isNonEmptyString, removeStringPrefix, removeStringSuffix } from './string-utils';
import { isPresent } from './type-guards';
import { describe, expect, test } from 'bun:test';

describe('primitive utilities', () => {
  test('removes only matching affixes, case-insensitively', () => {
    expect(removeStringPrefix('HTTPS://Example.com', 'https://')).toBe('Example.com');
    expect(removeStringSuffix('Example.JSON', '.json')).toBe('Example');
    expect(removeStringPrefix('Example', '')).toBe('Example');
    expect(removeStringSuffix('Example', '')).toBe('Example');
    expect(removeStringPrefix('Example', 'sample')).toBe('Example');
    expect(removeStringSuffix('Example', 'Exam')).toBe('Example');
  });
  test('clamps open bounds and preserves upper-bound precedence', () => {
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(11, 0, 10)).toBe(10);
    expect(clampNumber(5, 0, 10)).toBe(5);
    expect(clampNumber(-1, undefined, 10)).toBe(-1);
    expect(clampNumber(11, 0, undefined)).toBe(11);
    expect(clampNumber(5, 10, 0)).toBe(0);
    expect(clampNumber(Number.NaN, 0, 10)).toBeNaN();
  });
  test('interpolates and extrapolates without rounding', () => {
    expect(lerpNumber(1, 3, 0.25)).toBe(1.5);
    expect(lerpNumber(1, 3, 2)).toBe(5);
  });
});

test('string sorting retains UTF-16 ordering, including numeric strings and non-ASCII text', () => {
  expect(['ä', 'a', 'Z', '_', 'A', '9'].toSorted(compareStrings)).toStrictEqual(['9', 'A', 'Z', '_', 'a', 'ä']);
  expect(['2', '10', '1'].toSorted(compareStrings)).toStrictEqual(['1', '10', '2']);
  expect(compareStrings('same', 'same')).toBe(0);
});

test('display string guards distinguish empty text from meaningful whitespace', () => {
  expect(isNonEmptyString(undefined)).toBe(false);
  expect(isNonEmptyString(null)).toBe(false);
  expect(isNonEmptyString('')).toBe(false);
  expect(isNonEmptyString(' ')).toBe(true);
  expect(isNonEmptyString('0')).toBe(true);
});

test('presence guards keep falsy data and reject only missing values', () => {
  expect(isPresent(null)).toBe(false);
  expect(isPresent(undefined)).toBe(false);
  expect(isPresent(false)).toBe(true);
  expect(isPresent(0)).toBe(true);
  expect(isPresent('')).toBe(true);
});

test('numeric conditions preserve zero, NaN, signed values and infinity semantics', () => {
  expect(isNonzeroNumber(undefined)).toBe(false);
  expect(isNonzeroNumber(null)).toBe(false);
  expect(isNonzeroNumber(0)).toBe(false);
  expect(isNonzeroNumber(-0)).toBe(false);
  expect(isNonzeroNumber(Number.NaN)).toBe(false);
  expect(isNonzeroNumber(-1)).toBe(true);
  expect(isNonzeroNumber(1)).toBe(true);
  expect(isNonzeroNumber(Number.POSITIVE_INFINITY)).toBe(true);
  expect(isNonzeroNumber(Number.NEGATIVE_INFINITY)).toBe(true);
});

test('numeric defaults reject zero and NaN without losing signed values', () => {
  for (const value of [undefined, null, 0, -0, Number.NaN]) {
    expect(nonzeroNumber(value) ?? 17).toBe(17);
  }
  for (const value of [-1, 1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expect(nonzeroNumber(value) ?? 17).toBe(value);
  }
});

test('numeric defaults evaluate the input once and do not evaluate fallbacks eagerly', () => {
  let reads = 0;
  let fallbacks = 0;
  const read = () => {
    reads += 1;
    return 23;
  };
  const fallback = () => {
    fallbacks += 1;
    return 17;
  };
  expect(nonzeroNumber(read()) ?? fallback()).toBe(23);
  expect(reads).toBe(1);
  expect(fallbacks).toBe(0);
});

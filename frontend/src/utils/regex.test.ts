import { describe, expect, it } from 'vitest';

import { escapeRegex, getSearchRegex } from './regex';

describe('escapeRegex', () => {
  it('escapes special regex characters', () => {
    expect(escapeRegex('.')).toBe('\\.');
    expect(escapeRegex('*')).toBe('\\*');
    expect(escapeRegex('+')).toBe('\\+');
    expect(escapeRegex('?')).toBe('\\?');
    expect(escapeRegex('^')).toBe('\\^');
    expect(escapeRegex('$')).toBe('\\$');
    expect(escapeRegex('{')).toBe('\\{');
    expect(escapeRegex('}')).toBe('\\}');
    expect(escapeRegex('(')).toBe('\\(');
    expect(escapeRegex(')')).toBe('\\)');
    expect(escapeRegex('|')).toBe('\\|');
    expect(escapeRegex('[')).toBe('\\[');
    expect(escapeRegex(']')).toBe('\\]');
    expect(escapeRegex('\\')).toBe('\\\\');
  });

  it('escapes multiple special characters in a string', () => {
    expect(escapeRegex('foo.bar*baz')).toBe('foo\\.bar\\*baz');
    expect(escapeRegex('[test]')).toBe('\\[test\\]');
    expect(escapeRegex('(a|b)')).toBe('\\(a\\|b\\)');
  });

  it('leaves regular characters unchanged', () => {
    expect(escapeRegex('hello')).toBe('hello');
    expect(escapeRegex('foo123')).toBe('foo123');
    expect(escapeRegex('test-name_value')).toBe('test-name_value');
  });

  it('handles empty string', () => {
    expect(escapeRegex('')).toBe('');
  });

  it('handles strings with only special characters', () => {
    expect(escapeRegex('.*+?')).toBe('\\.\\*\\+\\?');
  });
});

describe('getSearchRegex', () => {
  it('returns a case-insensitive RegExp by default', () => {
    const regex = getSearchRegex('test');
    expect(regex.flags).toBe('i');
    expect('TEST'.match(regex)).toBeTruthy();
    expect('test'.match(regex)).toBeTruthy();
    expect('TeSt'.match(regex)).toBeTruthy();
  });

  it('supports regex patterns with dot wildcard', () => {
    const regex = getSearchRegex('foo.bar');
    expect('foo.bar'.match(regex)).toBeTruthy();
    expect('fooXbar'.match(regex)).toBeTruthy(); // . matches any char
    expect('foobar'.match(regex)).toBeFalsy(); // need exactly one char
  });

  it('supports custom flags', () => {
    const regex = getSearchRegex('test', 'g');
    expect(regex.flags).toBe('g');
  });

  it('returns cached regex for same query and flags', () => {
    const regex1 = getSearchRegex('cached-test');
    const regex2 = getSearchRegex('cached-test');
    expect(regex1).toBe(regex2); // Same reference
  });

  it('returns different regex for different flags', () => {
    const regexI = getSearchRegex('flag-test', 'i');
    const regexG = getSearchRegex('flag-test', 'g');
    expect(regexI).not.toBe(regexG);
    expect(regexI.flags).toBe('i');
    expect(regexG.flags).toBe('g');
  });

  it('supports character class patterns', () => {
    const regex = getSearchRegex('[abc]');
    expect('a'.match(regex)).toBeTruthy();
    expect('b'.match(regex)).toBeTruthy();
    expect('c'.match(regex)).toBeTruthy();
    expect('d'.match(regex)).toBeFalsy();
  });

  it('supports anchor patterns', () => {
    const regex = getSearchRegex('^test.*end$');
    expect('test-something-end'.match(regex)).toBeTruthy();
    expect('prefix-test-end'.match(regex)).toBeFalsy();
    expect('test-end-suffix'.match(regex)).toBeFalsy();
  });

  it('supports quantifier patterns', () => {
    const regex = getSearchRegex('fo+bar');
    expect('fobar'.match(regex)).toBeTruthy();
    expect('foobar'.match(regex)).toBeTruthy();
    expect('fooooobar'.match(regex)).toBeTruthy();
    expect('fbar'.match(regex)).toBeFalsy();
  });

  it('supports alternation patterns', () => {
    const regex = getSearchRegex('a|b');
    expect('a'.match(regex)).toBeTruthy();
    expect('b'.match(regex)).toBeTruthy();
    expect('c'.match(regex)).toBeFalsy();
  });

  it('handles empty query', () => {
    const regex = getSearchRegex('');
    expect('anything'.match(regex)).toBeTruthy(); // Empty regex matches everything
  });

  it('matches partial strings', () => {
    const regex = getSearchRegex('foo');
    expect('foobar'.match(regex)).toBeTruthy();
    expect('barfoo'.match(regex)).toBeTruthy();
    expect('barfoobaz'.match(regex)).toBeTruthy();
  });

  it('supports version range patterns', () => {
    const regex = getSearchRegex('com.shop.v[1-8].avro');
    expect('com.shop.v1.avro'.match(regex)).toBeTruthy();
    expect('com.shop.v5.avro'.match(regex)).toBeTruthy();
    expect('com.shop.v8.avro'.match(regex)).toBeTruthy();
    expect('com.shop.v9.avro'.match(regex)).toBeFalsy();
  });

  it('supports DLQ topic patterns', () => {
    const regex = getSearchRegex('^payment-.*-dlq$');
    expect('payment-orders-dlq'.match(regex)).toBeTruthy();
    expect('payment-refunds-dlq'.match(regex)).toBeTruthy();
    expect('payment-dlq'.match(regex)).toBeFalsy(); // needs something between
    expect('other-payment-orders-dlq'.match(regex)).toBeFalsy(); // prefix
  });
});

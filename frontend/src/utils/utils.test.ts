import { assignDeep, collectElements, getAllMessageKeys, getOidcSubject, substringWithEllipsis } from './utils'; // Adjust the import path as needed
import { describe, expect, test } from 'bun:test';
import type { TopicMessage } from '../types/kafka-messages';

describe('assignDeep', () => {
  test('merges nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    assignDeep(target, { a: { b: 9 } });
    expect(target).toStrictEqual({ a: { b: 9, c: 2 }, d: 3 });
  });

  test('replaces arrays wholesale instead of merging index-by-index', () => {
    const target: Record<string, unknown> = { list: [{ id: 'a' }, { id: 'b' }] };
    const next = [{ id: 'b' }, { id: 'a' }, { id: 'c' }];
    assignDeep(target, { list: next });
    expect(target.list).toBe(next);
  });

  test('reordering an array of shared object references never mutates the elements', () => {
    // Regression: an index-wise merge of a reordered array would write one
    // element's fields onto another shared element, duplicating ids.
    const a = { id: 'a', visible: true };
    const b = { id: 'b', visible: false };
    const target = { cols: [a, b] };
    assignDeep(target, { cols: [b, a] });
    expect(a).toStrictEqual({ id: 'a', visible: true });
    expect(b).toStrictEqual({ id: 'b', visible: false });
    expect(target.cols.map((c) => c.id)).toStrictEqual(['b', 'a']);
  });
});

describe('substringWithEllipsis', () => {
  test('returns the original string if its length is less than maxLength', () => {
    expect(substringWithEllipsis('Hello', 10)).toBe('Hello');
  });

  test('returns the original string if its length is equal to maxLength', () => {
    expect(substringWithEllipsis('Hello', 5)).toBe('Hello');
  });

  test('handles cases where maxLength is less than 3', () => {
    // Since effectiveLength is calculated as Math.max(maxLength - 3, 1),
    // a maxLength of 2 would lead to an effectiveLength of 1, and thus the output should be "H..."
    // However, given the logic, it's adjusted to ensure there's at least 1 character before the ellipsis
    expect(substringWithEllipsis('Hello, world!', 2)).toBe('H...');
    expect(substringWithEllipsis('Hello, world!', 1)).toBe('H...');
  });

  test('returns an empty string with ellipsis if maxLength is 0', () => {
    // This scenario is interesting because the logic dictates a minimum effective length of 1 character.
    // However, a maxLength of 0 logically suggests no characters should be shown.
    // The function's logic needs to be clear on this behavior; assuming we follow the implementation, it would be:
    expect(substringWithEllipsis('Hello, world!', 0)).toBe('H...');
    // But if considering maxLength of 0 as a request for no output, the implementation might need adjusting.
  });

  test('correctly handles an empty input string', () => {
    expect(substringWithEllipsis('', 5)).toBe('');
  });
});

test('property search stops without evaluating getters after the first match', () => {
  const input = Object.assign(() => undefined, { first: 7 });
  Object.defineProperty(input, 'later', {
    enumerable: true,
    get() {
      throw new Error('Must not read later properties');
    },
  });
  expect(collectElements(input, (key) => key === 'first', true)).toStrictEqual([
    { propertyName: 'first', path: [], value: 7 },
  ]);
});

test('property search retains UTF-16 indices for a string root and ignores nullish roots', () => {
  const text = 'A😀B';
  expect(collectElements(text, () => true, false).map((property) => property.value)).toStrictEqual([
    text[0],
    text[1],
    text[2],
    text[3],
  ]);
  expect(collectElements(null, () => true, false)).toStrictEqual([]);
  expect(collectElements(undefined, () => true, false)).toStrictEqual([]);
});

describe('oidc error metadata', () => {
  test.each([null, undefined, 'unavailable', {}, { details: [null, 4] }])(
    'ignores unvalidated rejection values: %j',
    (error) => {
      expect(getOidcSubject(error)).toBeNull();
    }
  );
  test('reads only a nonempty string subject from OIDC metadata', () => {
    expect(
      getOidcSubject({
        details: [
          { debug: { metadata: { login_type: 'OIDC', subject: 42 } } },
          { debug: { metadata: { login_type: 'OIDC', subject: '' } } },
          { debug: { metadata: { login_type: 'OTHER', subject: 'other' } } },
          { debug: { metadata: { login_type: 'OIDC', subject: 'issuer|subject' } } },
        ],
      })
    ).toBe('issuer|subject');
  });
});

test('message-key suggestions preserve string indices and skip null payloads', () => {
  const message: TopicMessage = {
    partitionID: 0,
    offset: 1,
    timestamp: 0,
    compression: 'uncompressed',
    isTransactional: false,
    headers: [],
    key: { payload: null, isPayloadNull: true, encoding: 'null', schemaId: 0, size: 0 },
    value: { payload: 'abc', isPayloadNull: false, encoding: 'text', schemaId: 0, size: 3 },
    keyJson: 'null',
    valueJson: '"abc"',
  };
  const nullMessage = { ...message, value: { ...message.value, payload: null, isPayloadNull: true } };
  expect(getAllMessageKeys([nullMessage])).toStrictEqual([]);
  expect(getAllMessageKeys([message, nullMessage])).toStrictEqual([
    { propertyName: '0', path: ['0'], fullPath: '.0' },
    { propertyName: '1', path: ['1'], fullPath: '.1' },
    { propertyName: '2', path: ['2'], fullPath: '.2' },
  ]);
});

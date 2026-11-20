import { toBadgeGroupItems } from './badge-group-items';
import { describe, expect, test } from 'bun:test';

const source = { id: (v: string) => v, text: (v: string) => v, content: (v: string) => v };

describe('toBadgeGroupItems', () => {
  test('keeps the domain id and text', () => {
    expect(toBadgeGroupItems(['a', 'b'], source).map(({ id, textValue }) => [id, textValue])).toEqual([
      ['a', 'a'],
      ['b', 'b'],
    ]);
  });

  test('suffixes repeats so BadgeGroup never sees a duplicate id', () => {
    const ids = toBadgeGroupItems(['a', 'a', 'a#2', 'a'], source).map(({ id }) => id);
    expect(ids).toEqual(['a', 'a#2', 'a#2#2', 'a#3']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('never returns an empty id or text', () => {
    const [item] = toBadgeGroupItems([''], source);
    expect(item?.id).toBe('-');
    expect(item?.textValue).toBe('-');
  });
});

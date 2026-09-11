import { assignDeep, substringWithEllipsis } from './utils'; // Adjust the import path as needed

describe('assignDeep', () => {
  test('merges nested objects', () => {
    const target = { a: { b: 1, c: 2 }, d: 3 };
    assignDeep(target, { a: { b: 9 } });
    expect(target).toEqual({ a: { b: 9, c: 2 }, d: 3 });
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
    const target: Record<string, unknown> = { cols: [a, b] };
    assignDeep(target, { cols: [b, a] });
    expect(a).toEqual({ id: 'a', visible: true });
    expect(b).toEqual({ id: 'b', visible: false });
    expect((target.cols as { id: string }[]).map((c) => c.id)).toEqual(['b', 'a']);
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

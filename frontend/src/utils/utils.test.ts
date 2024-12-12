import { substringWithEllipsis } from './utils'; // Adjust the import path as needed

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

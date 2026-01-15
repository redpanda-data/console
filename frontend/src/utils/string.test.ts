/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { describe, expect, test } from 'vitest';

import {
  formatFieldLabel,
  getTextPreview,
  getUserInitials,
  pluralize,
  pluralizeWithNumber,
  truncateWithEllipsis,
} from './string';

describe('formatFieldLabel', () => {
  test('should convert camelCase to Title Case with spaces', () => {
    expect(formatFieldLabel('userName')).toBe('User Name');
    expect(formatFieldLabel('firstName')).toBe('First Name');
  });

  test('should convert snake_case to spaces with first letter capitalized', () => {
    expect(formatFieldLabel('api_key')).toBe('Api key');
    expect(formatFieldLabel('some_field_name')).toBe('Some field name');
  });

  test('should capitalize first letter', () => {
    expect(formatFieldLabel('name')).toBe('Name');
  });
});

describe('pluralize', () => {
  test('should return singular for count of 1', () => {
    expect(pluralize(1, 'item')).toBe('item');
    expect(pluralize(1, 'child', 'ren')).toBe('child');
  });

  test('should return plural for count of 0', () => {
    expect(pluralize(0, 'item')).toBe('items');
  });

  test('should return plural for count greater than 1', () => {
    expect(pluralize(2, 'item')).toBe('items');
    expect(pluralize(5, 'child', 'ren')).toBe('children');
  });
});

describe('pluralizeWithNumber', () => {
  test('should include count with singular form', () => {
    expect(pluralizeWithNumber(1, 'item')).toBe('1 item');
  });

  test('should include count with plural form', () => {
    expect(pluralizeWithNumber(0, 'item')).toBe('0 items');
    expect(pluralizeWithNumber(5, 'item')).toBe('5 items');
  });

  test('should support custom suffix', () => {
    expect(pluralizeWithNumber(2, 'child', 'ren')).toBe('2 children');
    expect(pluralizeWithNumber(1, 'child', 'ren')).toBe('1 child');
  });
});

describe('truncateWithEllipsis', () => {
  test('should return short strings unchanged', () => {
    expect(truncateWithEllipsis('hello')).toBe('hello');
    expect(truncateWithEllipsis('abc123')).toBe('abc123');
    expect(truncateWithEllipsis('123456789012')).toBe('123456789012');
  });

  test('should truncate long strings with ellipsis', () => {
    expect(truncateWithEllipsis('1234567890123')).toBe('123456789012...');
    expect(truncateWithEllipsis('abcdefghijklmnopqrstuvwxyz')).toBe('abcdefghijkl...');
  });

  test('should respect custom maxLength', () => {
    expect(truncateWithEllipsis('1234567890', 5)).toBe('12345...');
    expect(truncateWithEllipsis('12345', 5)).toBe('12345');
    expect(truncateWithEllipsis('hello world', 8)).toBe('hello wo...');
  });

  test('should handle empty string', () => {
    expect(truncateWithEllipsis('')).toBe('');
  });

  test('should handle edge case where string equals maxLength', () => {
    expect(truncateWithEllipsis('abcdefghijkl', 12)).toBe('abcdefghijkl');
  });
});

describe('getTextPreview', () => {
  test('should return full content if fewer lines than limit', () => {
    expect(getTextPreview('line1\nline2', 3)).toBe('line1\nline2');
    expect(getTextPreview('single line', 3)).toBe('single line');
  });

  test('should return full content if exactly at limit', () => {
    expect(getTextPreview('line1\nline2\nline3', 3)).toBe('line1\nline2\nline3');
  });

  test('should truncate content to specified number of lines', () => {
    expect(getTextPreview('line1\nline2\nline3\nline4', 3)).toBe('line1\nline2\nline3');
    expect(getTextPreview('a\nb\nc\nd\ne\nf', 2)).toBe('a\nb');
  });

  test('should handle empty content', () => {
    expect(getTextPreview('', 3)).toBe('');
  });

  test('should handle single line content', () => {
    expect(getTextPreview('single', 1)).toBe('single');
  });

  test('should handle content with only newlines', () => {
    expect(getTextPreview('\n\n\n', 2)).toBe('\n');
  });
});

describe('getUserInitials', () => {
  test('should return first and last initials for two-word names', () => {
    expect(getUserInitials('John Doe')).toBe('JD');
    expect(getUserInitials('Alice Smith')).toBe('AS');
  });

  test('should return first and last initials for names with middle parts', () => {
    expect(getUserInitials('Mary J Parker')).toBe('MP');
    expect(getUserInitials('Mary Jane Watson Parker')).toBe('MP');
  });

  test('should return single initial for single-word names', () => {
    expect(getUserInitials('Alice')).toBe('A');
    expect(getUserInitials('Bob')).toBe('B');
  });

  test('should handle empty and null values', () => {
    expect(getUserInitials('')).toBe('');
    expect(getUserInitials('   ')).toBe('');
    expect(getUserInitials(undefined)).toBe('');
    expect(getUserInitials(null)).toBe('');
  });

  test('should handle extra whitespace', () => {
    expect(getUserInitials('  John   Doe  ')).toBe('JD');
    expect(getUserInitials('Alice\t\tSmith')).toBe('AS');
  });

  test('should uppercase initials', () => {
    expect(getUserInitials('john doe')).toBe('JD');
    expect(getUserInitials('ALICE SMITH')).toBe('AS');
  });
});

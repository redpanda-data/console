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

const CAMEL_CASE_REGEX = /([A-Z])/g;
const FIRST_CHAR_REGEX = /^\w/;

/**
 * Formats a field key into a human-readable label
 * Examples:
 * - userName → User Name
 * - api_key → Api Key
 * - some_field_name → Some Field Name
 *
 * @param key The field key to format
 * @returns A formatted label string
 */
export function formatFieldLabel(key: string): string {
  return key
    .replace(CAMEL_CASE_REGEX, ' $1') // Insert space before capital letters
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(FIRST_CHAR_REGEX, (c) => c.toUpperCase()); // Capitalize first letter
}

/**
 * Pluralizes a word based on count (without including the number)
 *
 * Examples:
 * - pluralize(0, 'item') → 'items'
 * - pluralize(1, 'item') → 'item'
 * - pluralize(2, 'item') → 'items'
 * - pluralize(2, 'child', 'ren') → 'children'
 * - pluralize(1, 'child', 'ren') → 'child'
 *
 * @param count The number to determine singular/plural
 * @param noun The word to pluralize
 * @param suffix The suffix to add for plural form (default: 's')
 * @returns The pluralized word without the count
 */
export const pluralize = (count: number, noun: string, suffix = 's'): string => `${noun}${count !== 1 ? suffix : ''}`;

/**
 * Pluralizes a word based on count and includes the number in the output
 *
 * Examples:
 * - pluralizeWithNumber(0, 'item') → '0 items'
 * - pluralizeWithNumber(1, 'item') → '1 item'
 * - pluralizeWithNumber(5, 'item') → '5 items'
 * - pluralizeWithNumber(2, 'child', 'ren') → '2 children'
 * - pluralizeWithNumber(1, 'child', 'ren') → '1 child'
 *
 * @param count The number to display and use for singular/plural determination
 * @param noun The word to pluralize
 * @param suffix The suffix to add for plural form (default: 's')
 * @returns The count followed by the pluralized word
 */
export const pluralizeWithNumber = (count: number, noun: string, suffix = 's'): string =>
  `${count} ${pluralize(count, noun, suffix)}`;

/**
 * Truncates a string to a specified length and adds an ellipsis if truncation occurs.
 *
 * Examples:
 * - truncateWithEllipsis('hello', 10) → 'hello'
 * - truncateWithEllipsis('hello world', 8) → 'hello...'
 * - truncateWithEllipsis('abcdefghijkl', 12) → 'abcdefghijkl'
 * - truncateWithEllipsis('abcdefghijklm', 12) → 'abcdefghijkl...'
 *
 * @param str The string to truncate
 * @param maxLength Maximum length before truncation (default: 12)
 * @returns The original string if within maxLength, otherwise truncated with ellipsis
 */
export const truncateWithEllipsis = (str: string, maxLength = 12): string => {
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength)}...`;
};

/**
 * Gets a preview of text content, limited to a specified number of lines.
 *
 * Examples:
 * - getTextPreview('line1\nline2', 3) → 'line1\nline2'
 * - getTextPreview('line1\nline2\nline3\nline4', 2) → 'line1\nline2'
 * - getTextPreview('single line', 5) → 'single line'
 *
 * @param content The text content to preview
 * @param maxLines Maximum number of lines to include
 * @returns The original content if within maxLines, otherwise truncated to maxLines
 */
export const getTextPreview = (content: string, maxLines: number): string => {
  const lines = content.split('\n');
  if (lines.length <= maxLines) {
    return content;
  }
  return lines.slice(0, maxLines).join('\n');
};

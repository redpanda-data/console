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
const WHITESPACE_REGEX = /\s+/;

/** `userName` / `api_key` -> `User Name` / `Api Key`. */
export function formatFieldLabel(key: string): string {
  return key
    .replace(CAMEL_CASE_REGEX, ' $1') // Insert space before capital letters
    .replace(/_/g, ' ') // Replace underscores with spaces
    .replace(FIRST_CHAR_REGEX, (c) => c.toUpperCase()); // Capitalize first letter
}

/** `pluralize(2, 'child', 'ren')` -> `'children'`. Count not included. */
export const pluralize = (count: number, noun: string, suffix = 's'): string => `${noun}${count !== 1 ? suffix : ''}`;

/** `pluralizeWithNumber(2, 'child', 'ren')` -> `'2 children'`. */
export const pluralizeWithNumber = (count: number, noun: string, suffix = 's'): string =>
  `${count} ${pluralize(count, noun, suffix)}`;

/** Clips to `maxLength` and appends an ellipsis only when it actually clipped. */
export const truncateWithEllipsis = (str: string, maxLength = 12): string => {
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength)}...`;
};

/** First `maxLines` lines of `content`, or all of it if shorter. */
export const getTextPreview = (content: string, maxLines: number): string => {
  const lines = content.split('\n');
  if (lines.length <= maxLines) {
    return content;
  }
  return lines.slice(0, maxLines).join('\n');
};

/** First and last word's initials, upper-cased: `'John B Doe'` -> `'JD'`. Empty for blank input. */
export const getUserInitials = (displayName: string | undefined | null): string => {
  if (!displayName?.trim()) {
    return '';
  }

  const words = displayName.trim().split(WHITESPACE_REGEX);
  const firstInitial = words[0]?.[0] ?? '';
  const lastInitial = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';

  return (firstInitial + lastInitial).toUpperCase();
};

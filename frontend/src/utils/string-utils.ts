/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/** Removes a matching affix case-insensitively, preserving the remaining casing. */
export function removeStringPrefix(value: string, prefix: string): string {
  return prefix.length > 0 && value.toLowerCase().startsWith(prefix.toLowerCase()) ? value.slice(prefix.length) : value;
}

export function removeStringSuffix(value: string, suffix: string): string {
  return suffix.length > 0 && value.toLowerCase().endsWith(suffix.toLowerCase())
    ? value.slice(0, value.length - suffix.length)
    : value;
}

/** The same UTF-16 ordering as JavaScript's default string-array sort, independent of locale. */
export function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/** Empty strings are absent for display/option guards; whitespace is meaningful. */
export function isNonEmptyString(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.length > 0;
}

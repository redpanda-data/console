/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/**
 * Splits text into runs of printable characters (strings) and ASCII control characters (their
 * char codes, below 32), in order. `maxLength` caps how many characters are read; at least one
 * character is always read.
 */
export function splitControlChars(str: string, maxLength?: number): (string | number)[] {
  const chars = Array.from(str);
  const parts: (string | number)[] = [];
  for (const char of maxLength === undefined ? chars : chars.slice(0, Math.max(1, maxLength))) {
    const code = char.charCodeAt(0);
    const last = parts.at(-1);
    if (code < 32) {
      parts.push(code);
    } else if (typeof last === 'string') {
      parts[parts.length - 1] = last + char;
    } else {
      parts.push(char);
    }
  }
  return parts;
}

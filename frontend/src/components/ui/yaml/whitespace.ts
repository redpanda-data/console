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

// Invisible spaces (esp. U+00A0) pasted from docs/chat break YAML indentation,
// which only accepts U+0020. Code points keep this source ASCII.
const INVISIBLE_SPACE_CODE_POINTS = [
  0xa0, 0x16_80, 0x20_00, 0x20_01, 0x20_02, 0x20_03, 0x20_04, 0x20_05, 0x20_06, 0x20_07, 0x20_08, 0x20_09, 0x20_0a,
  0x20_2f, 0x20_5f, 0x30_00,
];
const INVISIBLE_SPACES = new RegExp(
  `[${INVISIBLE_SPACE_CODE_POINTS.map((code) => String.fromCharCode(code)).join('')}]`,
  'g'
);

export function normalizePastedWhitespace(text: string): string {
  return text.replace(INVISIBLE_SPACES, ' ');
}

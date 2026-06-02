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

// Non-breaking and other invisible space separators routinely sneak in when
// pasting config from docs, chat, or rendered web pages. YAML only accepts
// regular spaces (U+0020) for indentation, so these silently break parsing
// (e.g. a child key gets read at the wrong level). Built from code points so
// the source stays ASCII; U+00A0 (non-breaking space) is the common culprit.
const INVISIBLE_SPACE_CODE_POINTS = [
  0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200a, 0x202f, 0x205f,
  0x3000,
];
const INVISIBLE_SPACES = new RegExp(
  `[${INVISIBLE_SPACE_CODE_POINTS.map((code) => String.fromCharCode(code)).join('')}]`,
  'g'
);

export function normalizePastedWhitespace(text: string): string {
  return text.replace(INVISIBLE_SPACES, ' ');
}

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

import { detectSlashTrigger, SLASH_TRIGGER_PATTERN } from './use-slash-command';
import { describe, expect, test } from 'bun:test';

/** Minimal mock satisfying detectSlashTrigger's editor API usage. */
function mockEditor(lineContent: string, cursorColumn: number, lineNumber = 1) {
  return {
    getPosition: () => ({ lineNumber, column: cursorColumn }),
    getModel: () => ({ getLineContent: () => lineContent }),
  };
}

// ─── SLASH_TRIGGER_PATTERN ───────────────────────────────────────────

describe('the SLASH_TRIGGER_PATTERN', () => {
  test('matches space', () => {
    expect(SLASH_TRIGGER_PATTERN.test(' ')).toBe(true);
  });

  test('matches tab', () => {
    expect(SLASH_TRIGGER_PATTERN.test('\t')).toBe(true);
  });

  test('does not match colon', () => {
    expect(SLASH_TRIGGER_PATTERN.test(':')).toBe(false);
  });

  test('does not match letters', () => {
    expect(SLASH_TRIGGER_PATTERN.test('a')).toBe(false);
  });

  test('does not match digits', () => {
    expect(SLASH_TRIGGER_PATTERN.test('0')).toBe(false);
  });

  test('does not match punctuation like dot or hyphen', () => {
    expect(SLASH_TRIGGER_PATTERN.test('.')).toBe(false);
    expect(SLASH_TRIGGER_PATTERN.test('-')).toBe(false);
  });
});

// ─── detectSlashTrigger ──────────────────────────────────────────────

describe('detectSlashTrigger', () => {
  describe('returns position when slash is at a valid trigger point', () => {
    test('/ at start of empty line', () => {
      expect(detectSlashTrigger(mockEditor('/', 2))).toEqual({ lineNumber: 1, column: 1 });
    });

    test('/ at start of line before other content', () => {
      expect(detectSlashTrigger(mockEditor('/input', 2))).toEqual({ lineNumber: 1, column: 1 });
    });

    test('/ after a space', () => {
      expect(detectSlashTrigger(mockEditor('  /', 4))).toEqual({ lineNumber: 1, column: 3 });
    });

    test('/ after colon (no longer triggers — prevents URL false positives)', () => {
      expect(detectSlashTrigger(mockEditor('key:/', 6))).toBeNull();
    });

    test('/ after colon+space', () => {
      expect(detectSlashTrigger(mockEditor('key: /', 7))).toEqual({ lineNumber: 1, column: 6 });
    });

    test('/ after tab', () => {
      expect(detectSlashTrigger(mockEditor('\t/', 3))).toEqual({ lineNumber: 1, column: 2 });
    });

    test('/ in indented YAML value', () => {
      expect(detectSlashTrigger(mockEditor('  output: /', 12))).toEqual({ lineNumber: 1, column: 11 });
    });

    test('preserves lineNumber from editor position', () => {
      expect(detectSlashTrigger(mockEditor('/', 2, 5))).toEqual({ lineNumber: 5, column: 1 });
    });
  });

  describe('returns null when slash is not at a valid trigger point', () => {
    test('/ mid-word', () => {
      expect(detectSlashTrigger(mockEditor('input/', 6))).toBeNull();
    });

    test('/ in file path', () => {
      expect(detectSlashTrigger(mockEditor('path: /tmp/', 12))).toBeNull();
    });

    test('/ in URL', () => {
      expect(detectSlashTrigger(mockEditor('url: https://example.com/', 26))).toBeNull();
    });

    test('/ after letter', () => {
      expect(detectSlashTrigger(mockEditor('kafka_franz/', 12))).toBeNull();
    });

    test('/ after digit', () => {
      expect(detectSlashTrigger(mockEditor('v2/', 3))).toBeNull();
    });

    test('/ after dot', () => {
      expect(detectSlashTrigger(mockEditor('file.json/', 10))).toBeNull();
    });

    test('/ after underscore', () => {
      expect(detectSlashTrigger(mockEditor('my_path/', 8))).toBeNull();
    });

    test('/ after hyphen', () => {
      expect(detectSlashTrigger(mockEditor('my-path/', 8))).toBeNull();
    });

    test('/ after closing bracket', () => {
      expect(detectSlashTrigger(mockEditor('items]/', 7))).toBeNull();
    });

    test('/ after closing quote', () => {
      expect(detectSlashTrigger(mockEditor('"value"/', 8))).toBeNull();
    });
  });

  describe('returns null for invalid editor state', () => {
    test('null position', () => {
      const ed = {
        getPosition: () => null,
        getModel: () => ({ getLineContent: () => '' }),
      };
      expect(detectSlashTrigger(ed)).toBeNull();
    });

    test('null model', () => {
      const ed = {
        getPosition: () => ({ lineNumber: 1, column: 2 }),
        getModel: () => null,
      };
      expect(detectSlashTrigger(ed)).toBeNull();
    });
  });

  describe('the YAML pipeline scenarios', () => {
    test('typing / to start a new value after label key', () => {
      expect(detectSlashTrigger(mockEditor('label: /', 9))).toEqual({ lineNumber: 1, column: 8 });
    });

    test('typing / in bloblang mapping after space', () => {
      expect(detectSlashTrigger(mockEditor('  root = /', 11))).toEqual({ lineNumber: 1, column: 10 });
    });

    test('not triggered in bloblang path expression', () => {
      expect(detectSlashTrigger(mockEditor('  root = this.metadata/', 24))).toBeNull();
    });

    test('not triggered in secret reference path', () => {
      expect(detectSlashTrigger(mockEditor('${secrets.my_secret/', 20))).toBeNull();
    });

    test('not triggered in broker URL', () => {
      expect(detectSlashTrigger(mockEditor('  - "redpanda:9092/', 20))).toBeNull();
    });

    test('triggered at start of indented line', () => {
      expect(detectSlashTrigger(mockEditor('    /', 6))).toEqual({ lineNumber: 1, column: 5 });
    });

    test('triggered after YAML list marker', () => {
      expect(detectSlashTrigger(mockEditor('  - /', 6))).toEqual({ lineNumber: 1, column: 5 });
    });
  });
});

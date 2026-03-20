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

import type { editor } from 'monaco-editor';
import { describe, expect, it } from 'vitest';

import { detectSlashTrigger, SLASH_TRIGGER_PATTERN } from './use-slash-command';

/** Minimal mock satisfying detectSlashTrigger's editor API usage. */
function mockEditor(lineContent: string, cursorColumn: number, lineNumber = 1) {
  return {
    getPosition: () => ({ lineNumber, column: cursorColumn }),
    getModel: () => ({ getLineContent: () => lineContent }),
  } as unknown as editor.IStandaloneCodeEditor;
}

// ─── SLASH_TRIGGER_PATTERN ───────────────────────────────────────────

describe('SLASH_TRIGGER_PATTERN', () => {
  it('matches space', () => {
    expect(SLASH_TRIGGER_PATTERN.test(' ')).toBe(true);
  });

  it('matches tab', () => {
    expect(SLASH_TRIGGER_PATTERN.test('\t')).toBe(true);
  });

  it('matches colon', () => {
    expect(SLASH_TRIGGER_PATTERN.test(':')).toBe(true);
  });

  it('does not match letters', () => {
    expect(SLASH_TRIGGER_PATTERN.test('a')).toBe(false);
  });

  it('does not match digits', () => {
    expect(SLASH_TRIGGER_PATTERN.test('0')).toBe(false);
  });

  it('does not match punctuation like dot or hyphen', () => {
    expect(SLASH_TRIGGER_PATTERN.test('.')).toBe(false);
    expect(SLASH_TRIGGER_PATTERN.test('-')).toBe(false);
  });
});

// ─── detectSlashTrigger ──────────────────────────────────────────────

describe('detectSlashTrigger', () => {
  describe('returns position when slash is at a valid trigger point', () => {
    it('/ at start of empty line', () => {
      expect(detectSlashTrigger(mockEditor('/', 2))).toEqual({ lineNumber: 1, column: 1 });
    });

    it('/ at start of line before other content', () => {
      expect(detectSlashTrigger(mockEditor('/input', 2))).toEqual({ lineNumber: 1, column: 1 });
    });

    it('/ after a space', () => {
      expect(detectSlashTrigger(mockEditor('  /', 4))).toEqual({ lineNumber: 1, column: 3 });
    });

    it('/ after colon', () => {
      expect(detectSlashTrigger(mockEditor('key:/', 6))).toEqual({ lineNumber: 1, column: 5 });
    });

    it('/ after colon+space', () => {
      expect(detectSlashTrigger(mockEditor('key: /', 7))).toEqual({ lineNumber: 1, column: 6 });
    });

    it('/ after tab', () => {
      expect(detectSlashTrigger(mockEditor('\t/', 3))).toEqual({ lineNumber: 1, column: 2 });
    });

    it('/ in indented YAML value', () => {
      expect(detectSlashTrigger(mockEditor('  output: /', 12))).toEqual({ lineNumber: 1, column: 11 });
    });

    it('preserves lineNumber from editor position', () => {
      expect(detectSlashTrigger(mockEditor('/', 2, 5))).toEqual({ lineNumber: 5, column: 1 });
    });
  });

  describe('returns null when slash is not at a valid trigger point', () => {
    it('/ mid-word', () => {
      expect(detectSlashTrigger(mockEditor('input/', 6))).toBeNull();
    });

    it('/ in file path', () => {
      expect(detectSlashTrigger(mockEditor('path: /tmp/', 12))).toBeNull();
    });

    it('/ in URL', () => {
      expect(detectSlashTrigger(mockEditor('url: https://example.com/', 26))).toBeNull();
    });

    it('/ after letter', () => {
      expect(detectSlashTrigger(mockEditor('kafka_franz/', 12))).toBeNull();
    });

    it('/ after digit', () => {
      expect(detectSlashTrigger(mockEditor('v2/', 3))).toBeNull();
    });

    it('/ after dot', () => {
      expect(detectSlashTrigger(mockEditor('file.json/', 10))).toBeNull();
    });

    it('/ after underscore', () => {
      expect(detectSlashTrigger(mockEditor('my_path/', 8))).toBeNull();
    });

    it('/ after hyphen', () => {
      expect(detectSlashTrigger(mockEditor('my-path/', 8))).toBeNull();
    });

    it('/ after closing bracket', () => {
      expect(detectSlashTrigger(mockEditor('items]/', 7))).toBeNull();
    });

    it('/ after closing quote', () => {
      expect(detectSlashTrigger(mockEditor('"value"/', 8))).toBeNull();
    });
  });

  describe('returns null for invalid editor state', () => {
    it('null position', () => {
      const ed = {
        getPosition: () => null,
        getModel: () => ({ getLineContent: () => '' }),
      } as unknown as editor.IStandaloneCodeEditor;
      expect(detectSlashTrigger(ed)).toBeNull();
    });

    it('null model', () => {
      const ed = {
        getPosition: () => ({ lineNumber: 1, column: 2 }),
        getModel: () => null,
      } as unknown as editor.IStandaloneCodeEditor;
      expect(detectSlashTrigger(ed)).toBeNull();
    });
  });

  describe('YAML pipeline scenarios', () => {
    it('typing / to start a new value after label key', () => {
      expect(detectSlashTrigger(mockEditor('label: /', 9))).toEqual({ lineNumber: 1, column: 8 });
    });

    it('typing / in bloblang mapping after space', () => {
      expect(detectSlashTrigger(mockEditor('  root = /', 11))).toEqual({ lineNumber: 1, column: 10 });
    });

    it('not triggered in bloblang path expression', () => {
      expect(detectSlashTrigger(mockEditor('  root = this.metadata/', 24))).toBeNull();
    });

    it('not triggered in secret reference path', () => {
      expect(detectSlashTrigger(mockEditor('${secrets.my_secret/', 20))).toBeNull();
    });

    it('not triggered in broker URL', () => {
      expect(detectSlashTrigger(mockEditor('  - "redpanda:9092/', 20))).toBeNull();
    });

    it('triggered at start of indented line', () => {
      expect(detectSlashTrigger(mockEditor('    /', 6))).toEqual({ lineNumber: 1, column: 5 });
    });

    it('triggered after YAML list marker', () => {
      expect(detectSlashTrigger(mockEditor('  - /', 6))).toEqual({ lineNumber: 1, column: 5 });
    });
  });
});

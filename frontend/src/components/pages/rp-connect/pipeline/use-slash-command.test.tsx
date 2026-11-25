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

import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';
import { act, renderHook } from '@testing-library/react';

import { useSlashCommand } from './use-slash-command';

type ContentChangeCallback = (e: { changes: Array<{ text: string }> }) => void;

function createMockEditor(lineContent: string, cursorColumn: number) {
  const contentChangeListeners: ContentChangeCallback[] = [];

  const instance = {
    getPosition: rs.fn(() => ({ lineNumber: 1, column: cursorColumn })),
    getModel: rs.fn(() => ({
      getLineContent: rs.fn(() => lineContent),
    })),
    onDidChangeModelContent: rs.fn((cb: ContentChangeCallback) => {
      contentChangeListeners.push(cb);
      return { dispose: rs.fn() };
    }),
    executeEdits: rs.fn(() => true),
    focus: rs.fn(),
  };

  return {
    instance,
    fireContentChange(text: string) {
      for (const cb of contentChangeListeners) {
        cb({ changes: [{ text }] });
      }
    },
  };
}

describe('useSlashCommand', () => {
  beforeEach(() => {
    rs.useFakeTimers();
  });

  afterEach(() => {
    rs.useRealTimers();
    rs.restoreAllMocks();
  });

  describe('subscribing to the editor', () => {
    test('starts with menu closed and no position', () => {
      const { result } = renderHook(() => useSlashCommand(null));
      expect(result.current.isOpen).toBe(false);
      expect(result.current.slashPosition).toBeNull();
    });

    test('does not subscribe when disabled', () => {
      const { instance } = createMockEditor('/', 2);
      renderHook(() => useSlashCommand(instance, false));
      expect(instance.onDidChangeModelContent).not.toHaveBeenCalled();
    });

    test('does not subscribe when editor is null', () => {
      const { result } = renderHook(() => useSlashCommand(null, true));
      expect(result.current.isOpen).toBe(false);
    });

    test('subscribes to content changes when enabled', () => {
      const { instance } = createMockEditor('/', 2);
      renderHook(() => useSlashCommand(instance, true));
      expect(instance.onDidChangeModelContent).toHaveBeenCalledExactlyOnceWith(expect.any(Function));
    });
  });

  describe('opening the menu', () => {
    test('opens menu when / is typed at valid position', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));

      expect(result.current.isOpen).toBe(true);
      expect(result.current.slashPosition).toStrictEqual({ lineNumber: 1, column: 3 });
    });

    test('does not open menu when / is typed mid-word', () => {
      const { instance, fireContentChange } = createMockEditor('input/', 6);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));

      expect(result.current.isOpen).toBe(false);
      expect(result.current.slashPosition).toBeNull();
    });

    test('does not open menu on non-slash content changes', () => {
      const { instance, fireContentChange } = createMockEditor('hello', 6);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('o'));

      expect(result.current.isOpen).toBe(false);
    });

    test('ignores content changes while menu is already open', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));
      expect(result.current.isOpen).toBe(true);

      // Fire another slash while open — should be ignored
      act(() => fireContentChange('/'));
      expect(result.current.isOpen).toBe(true);
      expect(result.current.slashPosition).toStrictEqual({ lineNumber: 1, column: 3 });
    });
  });

  describe('close', () => {
    test('closes the menu and clears position', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.close();
        rs.runAllTimers();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.slashPosition).toBeNull();
    });

    test('refocuses the editor after closing', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));

      act(() => {
        result.current.close();
        rs.runAllTimers();
      });

      expect(instance.focus).toHaveBeenCalledWith();
    });
  });

  describe('handleSlashSelect', () => {
    test('replaces the / character with selected text during active session', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));
      act(() => {
        result.current.handleSlashSelect('kafka_franz');
        rs.runAllTimers();
      });

      expect(instance.executeEdits).toHaveBeenCalledWith('slash-command', [
        {
          range: {
            startLineNumber: 1,
            startColumn: 3,
            endLineNumber: 1,
            endColumn: 4,
          },
          text: 'kafka_franz',
        },
      ]);
    });

    test('closes the menu after selection', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));
      act(() => {
        result.current.handleSlashSelect('kafka_franz');
        rs.runAllTimers();
      });

      expect(result.current.isOpen).toBe(false);
    });

    test('focuses editor after selection', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));
      act(() => {
        result.current.handleSlashSelect('kafka_franz');
        rs.runAllTimers();
      });

      expect(instance.focus).toHaveBeenCalledWith();
    });

    test('uses deferred range when popover was closed before selection (sub-dialog)', () => {
      const bloblangSnippet = `\${!metadata("kafka_key")}`;
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      // Open menu
      act(() => fireContentChange('/'));
      // Close without selecting (sub-dialog scenario)
      act(() => {
        result.current.close();
        rs.runAllTimers();
      });

      // Select via sub-dialog callback
      act(() => {
        result.current.handleSlashSelect(bloblangSnippet);
        rs.runAllTimers();
      });

      expect(instance.executeEdits).toHaveBeenCalledWith('slash-command', [
        {
          range: {
            startLineNumber: 1,
            startColumn: 3,
            endLineNumber: 1,
            endColumn: 4,
          },
          text: bloblangSnippet,
        },
      ]);
    });

    test('falls back to cursor position when no slash context exists', () => {
      const { instance } = createMockEditor('hello', 6);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => {
        result.current.handleSlashSelect('inserted text');
        rs.runAllTimers();
      });

      expect(instance.executeEdits).toHaveBeenCalledWith('slash-command', [
        {
          range: {
            startLineNumber: 1,
            startColumn: 6,
            endLineNumber: 1,
            endColumn: 6,
          },
          text: 'inserted text',
        },
      ]);
    });

    test('does nothing when editor is null', () => {
      const { result } = renderHook(() => useSlashCommand(null, true));

      // Should not throw
      act(() => {
        result.current.handleSlashSelect('text');
      });
    });
  });

  describe('onOpen callback', () => {
    test('calls onOpen callback when slash triggers menu', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const onOpen = rs.fn();
      const { result } = renderHook(() => useSlashCommand(instance, true, onOpen));

      act(() => fireContentChange('/'));

      expect(onOpen).toHaveBeenCalledExactlyOnceWith();
      expect(result.current.isOpen).toBe(true);
    });

    test('does not call onOpen on invalid slash position', () => {
      const { instance, fireContentChange } = createMockEditor('input/', 6);
      const onOpen = rs.fn();
      const { result } = renderHook(() => useSlashCommand(instance, true, onOpen));

      act(() => fireContentChange('/'));

      expect(onOpen).not.toHaveBeenCalled();
      expect(result.current.isOpen).toBe(false);
    });

    test('re-subscribes when onOpen changes', () => {
      const disposeFn = rs.fn();
      const instance = {
        getPosition: rs.fn(() => null),
        getModel: rs.fn(() => null),
        onDidChangeModelContent: rs.fn(() => ({ dispose: disposeFn })),
        executeEdits: rs.fn(() => true),
        focus: rs.fn(),
      };

      const onOpen1 = rs.fn();
      const onOpen2 = rs.fn();

      const { rerender } = renderHook(({ onOpen }) => useSlashCommand(instance, true, onOpen), {
        initialProps: { onOpen: onOpen1 },
      });

      expect(instance.onDidChangeModelContent).toHaveBeenCalledTimes(1);

      rerender({ onOpen: onOpen2 });

      expect(disposeFn).toHaveBeenCalledExactlyOnceWith();
      expect(instance.onDidChangeModelContent).toHaveBeenCalledTimes(2);
    });
  });

  describe('cleanup', () => {
    test('disposes Monaco subscription on unmount', () => {
      const disposeFn = rs.fn();
      const instance = {
        getPosition: rs.fn(() => null),
        getModel: rs.fn(() => null),
        onDidChangeModelContent: rs.fn(() => ({ dispose: disposeFn })),
        executeEdits: rs.fn(() => true),
        focus: rs.fn(),
      };

      const { unmount } = renderHook(() => useSlashCommand(instance, true));
      unmount();

      expect(disposeFn).toHaveBeenCalledExactlyOnceWith();
    });

    test('disposes subscription when enabled changes to false', () => {
      const disposeFn = rs.fn();
      const instance = {
        getPosition: rs.fn(() => null),
        getModel: rs.fn(() => null),
        onDidChangeModelContent: rs.fn(() => ({ dispose: disposeFn })),
        executeEdits: rs.fn(() => true),
        focus: rs.fn(),
      };

      const { rerender } = renderHook(({ enabled }) => useSlashCommand(instance, enabled), {
        initialProps: { enabled: true },
      });

      rerender({ enabled: false });
      expect(disposeFn).toHaveBeenCalledExactlyOnceWith();
    });
  });
});

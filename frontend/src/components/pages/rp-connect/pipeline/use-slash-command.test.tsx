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

import { act, renderHook } from '@testing-library/react';
import type { editor } from 'monaco-editor';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSlashCommand } from './use-slash-command';

type ContentChangeCallback = (e: { changes: Array<{ text: string }> }) => void;

function createMockEditor(lineContent: string, cursorColumn: number) {
  const contentChangeListeners: ContentChangeCallback[] = [];

  const instance = {
    getPosition: vi.fn(() => ({ lineNumber: 1, column: cursorColumn })),
    getModel: vi.fn(() => ({
      getLineContent: vi.fn(() => lineContent),
    })),
    onDidChangeModelContent: vi.fn((cb: ContentChangeCallback) => {
      contentChangeListeners.push(cb);
      return { dispose: vi.fn() };
    }),
    executeEdits: vi.fn(),
    focus: vi.fn(),
  } as unknown as editor.IStandaloneCodeEditor;

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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts with menu closed and no position', () => {
    const { result } = renderHook(() => useSlashCommand(null));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.slashPosition).toBeNull();
  });

  it('does not subscribe when disabled', () => {
    const { instance } = createMockEditor('/', 2);
    renderHook(() => useSlashCommand(instance, false));
    expect((instance.onDidChangeModelContent as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('does not subscribe when editor is null', () => {
    const { result } = renderHook(() => useSlashCommand(null, true));
    expect(result.current.isOpen).toBe(false);
  });

  it('subscribes to content changes when enabled', () => {
    const { instance } = createMockEditor('/', 2);
    renderHook(() => useSlashCommand(instance, true));
    expect(instance.onDidChangeModelContent).toHaveBeenCalledOnce();
  });

  it('opens menu when / is typed at valid position', () => {
    const { instance, fireContentChange } = createMockEditor('  /', 4);
    const { result } = renderHook(() => useSlashCommand(instance, true));

    act(() => fireContentChange('/'));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.slashPosition).toEqual({ lineNumber: 1, column: 3 });
  });

  it('does not open menu when / is typed mid-word', () => {
    const { instance, fireContentChange } = createMockEditor('input/', 6);
    const { result } = renderHook(() => useSlashCommand(instance, true));

    act(() => fireContentChange('/'));

    expect(result.current.isOpen).toBe(false);
    expect(result.current.slashPosition).toBeNull();
  });

  it('does not open menu on non-slash content changes', () => {
    const { instance, fireContentChange } = createMockEditor('hello', 6);
    const { result } = renderHook(() => useSlashCommand(instance, true));

    act(() => fireContentChange('o'));

    expect(result.current.isOpen).toBe(false);
  });

  it('ignores content changes while menu is already open', () => {
    const { instance, fireContentChange } = createMockEditor('  /', 4);
    const { result } = renderHook(() => useSlashCommand(instance, true));

    act(() => fireContentChange('/'));
    expect(result.current.isOpen).toBe(true);

    // Fire another slash while open — should be ignored
    act(() => fireContentChange('/'));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.slashPosition).toEqual({ lineNumber: 1, column: 3 });
  });

  describe('close', () => {
    it('closes the menu and clears position', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.close();
        vi.runAllTimers();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.slashPosition).toBeNull();
    });

    it('refocuses the editor after closing', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));

      act(() => {
        result.current.close();
        vi.runAllTimers();
      });

      expect(instance.focus).toHaveBeenCalled();
    });
  });

  describe('handleSlashSelect', () => {
    it('replaces the / character with selected text during active session', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));
      act(() => {
        result.current.handleSlashSelect('kafka_franz');
        vi.runAllTimers();
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

    it('closes the menu after selection', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));
      act(() => {
        result.current.handleSlashSelect('kafka_franz');
        vi.runAllTimers();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('focuses editor after selection', () => {
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => fireContentChange('/'));
      act(() => {
        result.current.handleSlashSelect('kafka_franz');
        vi.runAllTimers();
      });

      expect(instance.focus).toHaveBeenCalled();
    });

    it('uses deferred range when popover was closed before selection (sub-dialog)', () => {
      // biome-ignore lint/style/noUnusedTemplateLiteral: intentional bloblang interpolation syntax
      const bloblangSnippet = `\${!metadata("kafka_key")}`;
      const { instance, fireContentChange } = createMockEditor('  /', 4);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      // Open menu
      act(() => fireContentChange('/'));
      // Close without selecting (sub-dialog scenario)
      act(() => {
        result.current.close();
        vi.runAllTimers();
      });

      // Select via sub-dialog callback
      act(() => {
        result.current.handleSlashSelect(bloblangSnippet);
        vi.runAllTimers();
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

    it('falls back to cursor position when no slash context exists', () => {
      const { instance } = createMockEditor('hello', 6);
      const { result } = renderHook(() => useSlashCommand(instance, true));

      act(() => {
        result.current.handleSlashSelect('inserted text');
        vi.runAllTimers();
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

    it('does nothing when editor is null', () => {
      const { result } = renderHook(() => useSlashCommand(null, true));

      // Should not throw
      act(() => {
        result.current.handleSlashSelect('text');
      });
    });
  });

  describe('cleanup', () => {
    it('disposes Monaco subscription on unmount', () => {
      const disposeFn = vi.fn();
      const instance = {
        getPosition: vi.fn(),
        getModel: vi.fn(),
        onDidChangeModelContent: vi.fn(() => ({ dispose: disposeFn })),
        executeEdits: vi.fn(),
        focus: vi.fn(),
      } as unknown as editor.IStandaloneCodeEditor;

      const { unmount } = renderHook(() => useSlashCommand(instance, true));
      unmount();

      expect(disposeFn).toHaveBeenCalledOnce();
    });

    it('disposes subscription when enabled changes to false', () => {
      const disposeFn = vi.fn();
      const instance = {
        getPosition: vi.fn(),
        getModel: vi.fn(),
        onDidChangeModelContent: vi.fn(() => ({ dispose: disposeFn })),
        executeEdits: vi.fn(),
        focus: vi.fn(),
      } as unknown as editor.IStandaloneCodeEditor;

      const { rerender } = renderHook(({ enabled }) => useSlashCommand(instance, enabled), {
        initialProps: { enabled: true },
      });

      rerender({ enabled: false });
      expect(disposeFn).toHaveBeenCalledOnce();
    });
  });
});

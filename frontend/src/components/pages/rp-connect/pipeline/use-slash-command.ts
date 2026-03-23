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
import { useCallback, useEffect, useRef, useState } from 'react';

export type SlashPosition = { lineNumber: number; column: number };

export const SLASH_TRIGGER_PATTERN = /\s/;

/** Check if the `/` just typed is at a valid trigger position (start of line or after whitespace). */
export function detectSlashTrigger(editorInstance: editor.IStandaloneCodeEditor): SlashPosition | null {
  const position = editorInstance.getPosition();
  if (!position) {
    return null;
  }
  const model = editorInstance.getModel();
  if (!model) {
    return null;
  }
  const lineContent = model.getLineContent(position.lineNumber);
  const slashColumn = position.column - 1;
  const charBefore = slashColumn > 1 ? lineContent[slashColumn - 2] : undefined;

  if (slashColumn === 1 || (charBefore && SLASH_TRIGGER_PATTERN.test(charBefore))) {
    return { lineNumber: position.lineNumber, column: slashColumn };
  }
  return null;
}

/**
 * Hook that detects `/` typed in a Monaco editor and manages the slash command
 * menu lifecycle and text replacement on selection.
 *
 * Focus moves to the CommandInput inside the popover when the menu opens.
 * cmdk handles all keyboard navigation natively (ArrowUp/Down, Enter, Escape).
 */
export function useSlashCommand(
  editorInstance: editor.IStandaloneCodeEditor | null,
  enabled?: boolean,
  onOpen?: () => void
) {
  const [isOpen, setIsOpen] = useState(false);
  const [slashPosition, setSlashPosition] = useState<SlashPosition | null>(null);
  const slashPositionRef = useRef<SlashPosition | null>(null);
  // Preserved across close() so sub-dialog callbacks can still replace the / text
  const lastSlashRangeRef = useRef<{ start: SlashPosition; endColumn: number } | null>(null);

  // Ref for reading isOpen inside the Monaco subscription without causing re-subscribe
  // (event handler refs pattern — subscription stays stable across open/close cycles)
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const close = useCallback(() => {
    // Save the slash range before clearing so sub-dialog callbacks can replace the text
    if (slashPositionRef.current) {
      lastSlashRangeRef.current = {
        start: { ...slashPositionRef.current },
        endColumn: slashPositionRef.current.column + 1, // just the `/`
      };
    }
    setIsOpen(false);
    setSlashPosition(null);
    slashPositionRef.current = null;
    // Refocus editor after React render
    requestAnimationFrame(() => editorInstance?.focus());
  }, [editorInstance]);

  // Subscribe to editor content changes to detect `/` typed
  // (Rule 4: mount effect for external system sync — Monaco event subscription)
  useEffect(() => {
    if (!(enabled && editorInstance)) {
      return;
    }

    const disposable = editorInstance.onDidChangeModelContent((e) => {
      if (isOpenRef.current) {
        return;
      }

      const hasSlash = e.changes.some((change) => change.text.includes('/'));
      if (!hasSlash) {
        return;
      }

      const pos = detectSlashTrigger(editorInstance);
      if (pos) {
        slashPositionRef.current = pos;
        lastSlashRangeRef.current = null;
        setSlashPosition(pos);
        setIsOpen(true);
        onOpen?.();
      }
    });

    return () => disposable.dispose();
  }, [editorInstance, enabled, onOpen]);

  /**
   * Replace the `/` text with the selected item text and close.
   * Works both during active slash session (slashPositionRef) and after
   * the popover has been closed for a sub-dialog (lastSlashRangeRef).
   */
  const handleSlashSelect = useCallback(
    (text: string) => {
      if (!editorInstance) {
        return;
      }

      // Active slash session — replace just the `/` character
      if (slashPositionRef.current) {
        const slashPos = slashPositionRef.current;
        editorInstance.executeEdits('slash-command', [
          {
            range: {
              startLineNumber: slashPos.lineNumber,
              startColumn: slashPos.column,
              endLineNumber: slashPos.lineNumber,
              endColumn: slashPos.column + 1, // just `/`
            },
            text,
          },
        ]);
        close();
        editorInstance.focus();
        return;
      }

      // Deferred insert after sub-dialog — use saved range to replace `/`
      if (lastSlashRangeRef.current) {
        const { start, endColumn } = lastSlashRangeRef.current;
        editorInstance.executeEdits('slash-command', [
          {
            range: {
              startLineNumber: start.lineNumber,
              startColumn: start.column,
              endLineNumber: start.lineNumber,
              endColumn,
            },
            text,
          },
        ]);
        lastSlashRangeRef.current = null;
        editorInstance.focus();
        return;
      }

      // Final fallback — insert at cursor
      const position = editorInstance.getPosition();
      if (position) {
        editorInstance.executeEdits('slash-command', [
          {
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
            text,
          },
        ]);
      }
      editorInstance.focus();
    },
    [editorInstance, close]
  );

  return {
    isOpen,
    close,
    /** Line/column where `/` was typed — used for popover positioning */
    slashPosition,
    /** Replaces `/` with selected text and closes the menu */
    handleSlashSelect,
  };
}

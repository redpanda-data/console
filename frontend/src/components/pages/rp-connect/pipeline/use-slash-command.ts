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

import type { editor, IRange } from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SlashPosition = { lineNumber: number; column: number };

export const SLASH_TRIGGER_PATTERN = /\s/;

/** A `/` triggers at the start of a line or after whitespace. */
function isSlashTriggerColumn(lineContent: string, slashColumn: number): boolean {
  const charBefore = slashColumn > 1 ? lineContent[slashColumn - 2] : undefined;
  return slashColumn === 1 || Boolean(charBefore && SLASH_TRIGGER_PATTERN.test(charBefore));
}

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
  const slashColumn = position.column - 1;
  return isSlashTriggerColumn(model.getLineContent(position.lineNumber), slashColumn)
    ? { lineNumber: position.lineNumber, column: slashColumn }
    : null;
}

type SavedSlashRange = { start: SlashPosition; endColumn: number };

const hasTypedSlash = (e: editor.IModelContentChangedEvent) => e.changes.some((change) => change.text.includes('/'));

function lineRange(lineNumber: number, startColumn: number, endColumn: number): IRange {
  return { startLineNumber: lineNumber, startColumn, endLineNumber: lineNumber, endColumn };
}

/**
 * What the selected text replaces: the `/` of the active slash session, the `/` saved when the popover
 * closed for a sub-dialog, or (with neither) an empty range at the cursor.
 */
function slashReplaceRange(
  editorInstance: editor.IStandaloneCodeEditor,
  slashPos: SlashPosition | null,
  savedRange: SavedSlashRange | null
): IRange | null {
  if (slashPos) {
    return lineRange(slashPos.lineNumber, slashPos.column, slashPos.column + 1); // just `/`
  }
  if (savedRange) {
    return lineRange(savedRange.start.lineNumber, savedRange.start.column, savedRange.endColumn);
  }
  const position = editorInstance.getPosition();
  return position ? lineRange(position.lineNumber, position.column, position.column) : null;
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
  const lastSlashRangeRef = useRef<SavedSlashRange | null>(null);

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
      if (isOpenRef.current || !hasTypedSlash(e)) {
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

      const isActiveSession = slashPositionRef.current !== null;
      const range = slashReplaceRange(editorInstance, slashPositionRef.current, lastSlashRangeRef.current);
      if (range) {
        editorInstance.executeEdits('slash-command', [{ range, text }]);
      }
      // An active session closes the popover; a deferred insert after a sub-dialog spends the saved range.
      if (isActiveSession) {
        close();
      } else {
        lastSlashRangeRef.current = null;
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

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

type SlashPosition = { lineNumber: number; column: number };

// Monaco enum values used as literals — the `declare enum` types from monaco-editor
// are not available as runtime values in all bundler configurations.
const WIDGET_POSITION_BELOW = 2; // ContentWidgetPositionPreference.BELOW
const WIDGET_POSITION_ABOVE = 1; // ContentWidgetPositionPreference.ABOVE
const KEY_TAB = 2; // KeyCode.Tab
const KEY_ENTER = 3; // KeyCode.Enter
const KEY_ESCAPE = 9; // KeyCode.Escape
const KEY_UP = 16; // KeyCode.UpArrow
const KEY_DOWN = 18; // KeyCode.DownArrow

function createWidgetDom() {
  const el = document.createElement('div');
  // Sit above Monaco's scrollbars (z-11), suggest widget (z-40), and surrounding UI
  el.style.zIndex = '50';
  return el;
}

/**
 * Hook that detects `/` typed in a Monaco editor and manages the slash command
 * menu lifecycle: positioning via IContentWidget, keyboard interception via
 * context keys, and query tracking.
 */
export function useSlashCommand(editorInstance: editor.IStandaloneCodeEditor | null) {
  const [isOpen, setIsOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const slashPositionRef = useRef<SlashPosition | null>(null);
  // Preserved across close() so sub-dialog callbacks can still replace the /query text
  const lastSlashRangeRef = useRef<{ start: SlashPosition; endColumn: number } | null>(null);
  const widgetDomRef = useRef<HTMLDivElement>(createWidgetDom());
  const contextKeyRef = useRef<editor.IContextKey<boolean> | null>(null);
  const commandContainerRef = useRef<HTMLDivElement>(null);
  const isWidgetMountedRef = useRef(false);

  // Stable reference to content widget — getPosition reads slashPositionRef at call time
  const widgetRef = useRef<editor.IContentWidget>({
    getId: () => 'slash-command-widget',
    getDomNode: () => widgetDomRef.current,
    getPosition: () =>
      slashPositionRef.current
        ? {
            position: slashPositionRef.current,
            preference: [WIDGET_POSITION_BELOW, WIDGET_POSITION_ABOVE],
          }
        : null,
    allowEditorOverflow: true,
    suppressMouseDown: true,
  });

  const close = useCallback(() => {
    // Save the slash range before clearing so sub-dialog callbacks can replace the text
    if (slashPositionRef.current && editorInstance) {
      const cursorPos = editorInstance.getPosition();
      lastSlashRangeRef.current = {
        start: { ...slashPositionRef.current },
        endColumn: cursorPos?.column ?? slashPositionRef.current.column + 1,
      };
    }
    setIsOpen(false);
    setSlashQuery('');
    slashPositionRef.current = null;
  }, [editorInstance]);

  // Forward a key event to the cmdk root element
  const forwardKey = useCallback((key: string) => {
    commandContainerRef.current?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }, []);

  // Select current item — forward Enter to cmdk which triggers onSelect
  const selectCurrentItem = useCallback(() => {
    forwardKey('Enter');
  }, [forwardKey]);

  // Register context key + keyboard actions (external system sync — Rule 4)
  useEffect(() => {
    if (!editorInstance) {
      return;
    }

    contextKeyRef.current = editorInstance.createContextKey('slashMenuOpen', false);

    const disposables = [
      editorInstance.addAction({
        id: 'slash-menu-down',
        label: 'Slash Menu: Next Item',
        keybindings: [KEY_DOWN],
        precondition: 'slashMenuOpen',
        keybindingContext: 'slashMenuOpen',
        run: () => forwardKey('ArrowDown'),
      }),
      editorInstance.addAction({
        id: 'slash-menu-up',
        label: 'Slash Menu: Previous Item',
        keybindings: [KEY_UP],
        precondition: 'slashMenuOpen',
        keybindingContext: 'slashMenuOpen',
        run: () => forwardKey('ArrowUp'),
      }),
      editorInstance.addAction({
        id: 'slash-menu-select',
        label: 'Slash Menu: Select Item',
        keybindings: [KEY_ENTER],
        precondition: 'slashMenuOpen',
        keybindingContext: 'slashMenuOpen',
        run: () => selectCurrentItem(),
      }),
      editorInstance.addAction({
        id: 'slash-menu-select-tab',
        label: 'Slash Menu: Select Item (Tab)',
        keybindings: [KEY_TAB],
        precondition: 'slashMenuOpen',
        keybindingContext: 'slashMenuOpen',
        run: () => selectCurrentItem(),
      }),
      editorInstance.addAction({
        id: 'slash-menu-close',
        label: 'Slash Menu: Close',
        keybindings: [KEY_ESCAPE],
        precondition: 'slashMenuOpen',
        keybindingContext: 'slashMenuOpen',
        run: () => close(),
      }),
    ];

    return () => {
      contextKeyRef.current?.reset();
      for (const d of disposables) {
        d.dispose();
      }
    };
  }, [editorInstance, forwardKey, selectCurrentItem, close]);

  // Sync context key with open state (external system sync — Rule 4)
  useEffect(() => {
    contextKeyRef.current?.set(isOpen);
  }, [isOpen]);

  // Manage content widget lifecycle (external system sync — Rule 4)
  useEffect(() => {
    if (!editorInstance) {
      return;
    }

    if (isOpen && !isWidgetMountedRef.current) {
      editorInstance.addContentWidget(widgetRef.current);
      isWidgetMountedRef.current = true;
    } else if (!isOpen && isWidgetMountedRef.current) {
      editorInstance.removeContentWidget(widgetRef.current);
      isWidgetMountedRef.current = false;
    }
  }, [editorInstance, isOpen]);

  // Cleanup widget on unmount
  useEffect(
    () => () => {
      if (editorInstance && isWidgetMountedRef.current) {
        editorInstance.removeContentWidget(widgetRef.current);
        isWidgetMountedRef.current = false;
      }
    },
    [editorInstance]
  );

  // Detect `/` typed — subscribe to editor content changes (external system sync — Rule 4)
  useEffect(() => {
    if (!editorInstance) {
      return;
    }

    const disposable = editorInstance.onDidChangeModelContent((e) => {
      if (isOpen) {
        return;
      }

      for (const change of e.changes) {
        if (!change.text.includes('/')) {
          continue;
        }

        const position = editorInstance.getPosition();
        if (!position) {
          continue;
        }

        const model = editorInstance.getModel();
        if (!model) {
          continue;
        }

        const lineContent = model.getLineContent(position.lineNumber);
        const slashColumn = position.column - 1;
        const charBefore = slashColumn > 1 ? lineContent[slashColumn - 2] : undefined;

        if (slashColumn === 1 || (charBefore && /[\s:]/.test(charBefore))) {
          slashPositionRef.current = { lineNumber: position.lineNumber, column: slashColumn };
          lastSlashRangeRef.current = null;
          setSlashQuery('');
          setIsOpen(true);
        }
      }
    });

    return () => disposable.dispose();
  }, [editorInstance, isOpen]);

  // Track typing after `/` and close on cursor escape (external system sync — Rule 4)
  useEffect(() => {
    if (!(editorInstance && isOpen)) {
      return;
    }

    const contentDisposable = editorInstance.onDidChangeModelContent(() => {
      const position = editorInstance.getPosition();
      const model = editorInstance.getModel();
      const slashPos = slashPositionRef.current;
      if (!(position && model && slashPos)) {
        return;
      }

      if (position.lineNumber !== slashPos.lineNumber || position.column < slashPos.column) {
        close();
        return;
      }

      const lineContent = model.getLineContent(position.lineNumber);
      if (lineContent[slashPos.column - 1] !== '/') {
        close();
        return;
      }

      const query = lineContent.substring(slashPos.column, position.column - 1);
      setSlashQuery(query);
    });

    const cursorDisposable = editorInstance.onDidChangeCursorPosition((e) => {
      const slashPos = slashPositionRef.current;
      if (!slashPos) {
        return;
      }

      if (e.position.lineNumber !== slashPos.lineNumber || e.position.column < slashPos.column) {
        close();
      }
    });

    return () => {
      contentDisposable.dispose();
      cursorDisposable.dispose();
    };
  }, [editorInstance, isOpen, close]);

  /**
   * Replace the `/query` text with the selected item text and close.
   * Works both during active slash session (slashPositionRef) and after
   * the popover has been closed for a sub-dialog (lastSlashRangeRef).
   */
  const handleSlashSelect = useCallback(
    (text: string) => {
      if (!editorInstance) {
        return;
      }

      // Active slash session — replace from `/` to current cursor
      if (slashPositionRef.current) {
        const slashPos = slashPositionRef.current;
        const currentPos = editorInstance.getPosition();
        if (currentPos) {
          editorInstance.executeEdits('slash-command', [
            {
              range: {
                startLineNumber: slashPos.lineNumber,
                startColumn: slashPos.column,
                endLineNumber: currentPos.lineNumber,
                endColumn: currentPos.column,
              },
              text,
            },
          ]);
        }
        close();
        editorInstance.focus();
        return;
      }

      // Deferred insert after sub-dialog — use saved range to replace `/query`
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
    slashQuery,
    /** DOM node the popover content should portal into */
    widgetDom: widgetDomRef.current,
    /** Ref to attach to the Command container for keyboard forwarding */
    commandContainerRef,
    /** Replaces `/query` with selected text and closes the menu */
    handleSlashSelect,
  };
}

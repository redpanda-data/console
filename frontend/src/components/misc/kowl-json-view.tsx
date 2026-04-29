/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { Box } from '@redpanda-data/ui';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from 'react';

import KowlEditor, { type IStandaloneCodeEditor } from './kowl-editor';

const READ_ONLY_EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  // PERFORMANCE CONFIG: Fixes blank content bug when scrolling large JSON (40-50KB+)
  // Issue: wordWrap: 'on' + 40KB single-line strings = blank content appears during scroll
  // Solution: Wrap at fixed column to break long lines into manageable chunks
  wordWrap: 'wordWrapColumn',
  wordWrapColumn: 120, // Lines >120 chars wrap. Prevents blank screen with large payloads
  wrappingStrategy: 'simple', // 'advanced' causes 2s+ delays on large content
  stopRenderingLineAfter: 10_000, // DO NOT set to -1: causes severe performance issues
  maxTokenizationLineLength: 20_000, // Syntax highlighting limit
  automaticLayout: false,
  folding: false,
  showFoldingControls: 'never',
  lineNumbers: 'off',
  renderLineHighlight: 'none',
  renderValidationDecorations: 'off',
  hover: { enabled: false },
  links: false,
  matchBrackets: 'never',
  stickyScroll: { enabled: false },
  guides: {
    indentation: false,
    highlightActiveIndentation: false,
    bracketPairs: false,
    bracketPairsHorizontal: false,
    highlightActiveBracketPair: false,
  },
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
  },
  scrollBeyondLastLine: false,
} as const;

export const KowlJsonView = (props: { srcObj: object | string | null | undefined; style?: CSSProperties }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });
  const str = useMemo(
    () => (typeof props.srcObj === 'string' ? props.srcObj : JSON.stringify(props.srcObj, undefined, 4)),
    [props.srcObj]
  );

  const scheduleLayout = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;

      const editor = editorRef.current;
      const container = containerRef.current;
      if (!(editor && container)) {
        return;
      }

      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) {
        return;
      }

      const nextSize = {
        width: Math.floor(width),
        height: Math.floor(height),
      };

      if (nextSize.width === lastSizeRef.current.width && nextSize.height === lastSizeRef.current.height) {
        return;
      }

      lastSizeRef.current = nextSize;
      editor.layout(nextSize);
    });
  }, []);

  const handleMount = useCallback(
    (editor: IStandaloneCodeEditor) => {
      editorRef.current = editor;
      lastSizeRef.current = { width: 0, height: 0 };
      scheduleLayout();
    },
    [scheduleLayout]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    scheduleLayout();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', scheduleLayout);

      return () => {
        window.removeEventListener('resize', scheduleLayout);
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
        }
      };
    }

    const resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [scheduleLayout]);

  return (
    <Box
      display="block"
      height="96"
      position="relative"
      style={{ minHeight: '10rem', maxHeight: '45rem', ...props.style }}
    >
      <Box h="full" position="absolute" ref={containerRef} w="full">
        <KowlEditor language="json" onMount={handleMount} options={READ_ONLY_EDITOR_OPTIONS} value={str} />
      </Box>
    </Box>
  );
};

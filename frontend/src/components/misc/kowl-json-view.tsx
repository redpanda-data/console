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

import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from 'react';

import KowlEditor, { type IStandaloneCodeEditor } from './kowl-editor';

const READ_ONLY_EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
  // WARNING: Keep fixed-column wrapping; wordWrap 'on' can blank the viewer for large single-line payloads.
  wordWrap: 'wordWrapColumn',
  wordWrapColumn: 120,
  // WARNING: Keep simple wrapping; advanced wrapping stalls on large payloads.
  wrappingStrategy: 'simple',
  // WARNING: Keep the line rendering cap; disabling it can make the large-payload viewer unresponsive.
  stopRenderingLineAfter: 10_000,
  maxTokenizationLineLength: 20_000,
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

/**
 * Read-only JSON viewer. Enable `escapeLatin1` for Avro JSON bytes so copying text
 * preserves the original byte escapes instead of yielding UTF-8 glyphs.
 */
export const KowlJsonView = (props: {
  srcObj: object | string | null | undefined;
  style?: CSSProperties;
  escapeLatin1?: boolean;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastSizeRef = useRef({ width: 0, height: 0 });
  const str = useMemo(() => {
    const raw = typeof props.srcObj === 'string' ? props.srcObj : JSON.stringify(props.srcObj, undefined, 4);
    if (!props.escapeLatin1) {
      return raw;
    }
    return raw.replace(/[\u0080-\u00ff]/gu, (c) => `\\u00${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
  }, [props.srcObj, props.escapeLatin1]);

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

      const nextSize = getChangedEditorSize(container, lastSizeRef.current);
      if (!nextSize) {
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
    <div className="relative h-96 max-h-180 min-h-40" style={props.style}>
      <div className="absolute inset-0" ref={containerRef}>
        <KowlEditor language="json" onMount={handleMount} options={READ_ONLY_EDITOR_OPTIONS} value={str} />
      </div>
    </div>
  );
};

function getChangedEditorSize(container: HTMLElement, previousSize: { width: number; height: number }) {
  const { width, height } = container.getBoundingClientRect();
  if (width === 0 || height === 0) {
    return null;
  }
  const nextSize = { width: Math.floor(width), height: Math.floor(height) };
  return nextSize.width === previousSize.width && nextSize.height === previousSize.height ? null : nextSize;
}

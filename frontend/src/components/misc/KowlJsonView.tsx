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
import { observer } from 'mobx-react';
import { type CSSProperties, useCallback, useEffect, useMemo, useRef } from 'react';
import KowlEditor, { type IStandaloneCodeEditor } from './KowlEditor';

const READ_ONLY_EDITOR_OPTIONS = {
  readOnly: true,
  domReadOnly: true,
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
} as const;

export const KowlJsonView = observer(
  (props: {
    srcObj: object | string | null | undefined;
    style?: CSSProperties;
    // escapeLatin1 re-escapes code points in 0x80-0xFF as \u00XX so bytes from
    // Avro's JSON bytes encoding survive copy-paste out of the viewer. Without
    // this, JSON.stringify emits the code point as a literal glyph and the
    // clipboard receives the UTF-8 encoding, not the original byte.
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
      return raw.replace(/[\u0080-\u00ff]/g, (c) => `\\u00${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
    }, [props.srcObj, props.escapeLatin1]);

    const scheduleLayout = useCallback(() => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        const editor = editorRef.current;
        const container = containerRef.current;
        if (!editor || !container) return;

        const { width, height } = container.getBoundingClientRect();
        if (width === 0 || height === 0) return;

        const nextSize = {
          width: Math.floor(width),
          height: Math.floor(height),
        };

        if (nextSize.width === lastSizeRef.current.width && nextSize.height === lastSizeRef.current.height) return;

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
      [scheduleLayout],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      scheduleLayout();

      if (typeof ResizeObserver === 'undefined') {
        window.addEventListener('resize', scheduleLayout);

        return () => {
          window.removeEventListener('resize', scheduleLayout);
          if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
        };
      }

      const observer = new ResizeObserver(() => {
        scheduleLayout();
      });
      observer.observe(container);

      return () => {
        observer.disconnect();
        if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      };
    }, [scheduleLayout]);

    return (
      <Box
        display="block"
        minHeight="40"
        maxHeight="45rem" // no chakra space equivalent exists
        height="96"
        style={props.style}
        position="relative"
      >
        <Box ref={containerRef} position="absolute" h="full" w="full">
          <KowlEditor
            value={str}
            language="json"
            onMount={handleMount}
            options={READ_ONLY_EDITOR_OPTIONS}
          />
        </Box>
      </Box>
    );
  },
);

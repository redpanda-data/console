import { afterEach, beforeEach, describe, expect, test } from '@rstest/core';
import { act, render, waitFor } from '@testing-library/react';
import * as React from 'react';

import type { JsonViewEditorProps } from './json-view-editor';
import type { IStandaloneCodeEditor } from './kowl-editor';
import { KowlJsonView } from './kowl-json-view';

const { editorLayoutSpy, editorPropsSpy } = rs.hoisted(() => ({
  editorLayoutSpy: rs.fn<IStandaloneCodeEditor['layout']>(),
  editorPropsSpy: rs.fn<(props: JsonViewEditorProps) => void>(),
}));

rs.mock('./json-view-editor', () => {
  const MockEditor = MockJsonViewEditor;

  return {
    __esModule: true,
    JsonViewEditor: MockEditor,
  };
});

describe('the KowlJsonView', () => {
  let resizeCallback: (() => void) | undefined;
  let currentSize = { width: 640, height: 384 };
  let getBoundingClientRectSpy: ReturnType<typeof rs.spyOn>;

  beforeEach(() => {
    editorLayoutSpy.mockReset();
    editorPropsSpy.mockReset();
    resizeCallback = undefined;
    currentSize = { width: 640, height: 384 };

    rs.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    rs.stubGlobal('cancelAnimationFrame', rs.fn());

    class ResizeObserverMock implements ResizeObserver {
      unobserve = rs.fn();
      static current: ResizeObserverMock;
      observe = rs.fn();
      disconnect = rs.fn();

      constructor(callback: ResizeObserverCallback) {
        resizeCallback = () => callback([], this);
        ResizeObserverMock.current = this;
      }
    }

    rs.stubGlobal('ResizeObserver', ResizeObserverMock);
    getBoundingClientRectSpy = rs.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      width: currentSize.width,
      height: currentSize.height,
      top: 0,
      left: 0,
      right: currentSize.width,
      bottom: currentSize.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }));
  });

  afterEach(() => {
    rs.unstubAllGlobals();
    getBoundingClientRectSpy.mockRestore();
  });

  test('uses the lightweight read-only monaco preset and manually lays out the editor', async () => {
    render(<KowlJsonView srcObj={{ market: 'BSEX' }} />);

    await waitFor(() => {
      expect(editorLayoutSpy).toHaveBeenCalledWith({ width: 640, height: 384 });
    });

    expect(editorPropsSpy).toHaveBeenCalledWith(expect.objectContaining({ value: '{\n    "market": "BSEX"\n}' }));
    expect(editorPropsSpy.mock.lastCall?.[0].options).toMatchObject({
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
      wordWrap: 'wordWrapColumn',
      wordWrapColumn: 120,
      wrappingStrategy: 'simple',
      stopRenderingLineAfter: 10_000,
      maxTokenizationLineLength: 20_000,
    });
  });

  test('relayouts only when the container size changes', async () => {
    render(<KowlJsonView srcObj={{ market: 'BSEX' }} />);

    await waitFor(() => {
      expect(editorLayoutSpy).toHaveBeenCalledTimes(1);
    });

    act(() => {
      resizeCallback?.();
    });

    await waitFor(() => {
      expect(editorLayoutSpy).toHaveBeenCalledTimes(1);
    });

    currentSize = { width: 800, height: 480 };

    act(() => {
      resizeCallback?.();
    });

    await waitFor(() => {
      expect(editorLayoutSpy).toHaveBeenCalledTimes(2);
    });

    expect(editorLayoutSpy).toHaveBeenLastCalledWith({ width: 800, height: 480 });
  });

  test('escapeLatin1 re-escapes Latin-1 code points so copy-paste recovers the original byte', async () => {
    render(<KowlJsonView escapeLatin1 srcObj={{ v: 'ÛN' }} />);

    await waitFor(() => {
      const value = editorPropsSpy.mock.lastCall?.[0].value;
      expect(value).toContain('\\u00db');
      expect(value).not.toContain('Û');
    });
  });

  test('without escapeLatin1, Latin-1 glyphs pass through to the editor unchanged', async () => {
    render(<KowlJsonView srcObj={{ v: 'ÛN' }} />);

    await waitFor(() => {
      const value = editorPropsSpy.mock.lastCall?.[0].value;
      expect(value).toContain('Û');
      expect(value).not.toContain('\\u00db');
    });
  });
});

function MockJsonViewEditor(props: JsonViewEditorProps) {
  editorPropsSpy(props);
  React.useEffect(() => {
    props.onMount?.({
      layout: editorLayoutSpy,
    });
  }, [props.onMount]);
  return <div data-testid="mock-kowl-editor">{props.value}</div>;
}

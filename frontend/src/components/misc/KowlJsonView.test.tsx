import { act, render, waitFor } from '../../test-utils';
import { KowlJsonView } from './KowlJsonView';

const { editorLayoutSpy, editorPropsSpy } = vi.hoisted(() => ({
  editorLayoutSpy: vi.fn(),
  editorPropsSpy: vi.fn(),
}));

vi.mock('./KowlEditor', async () => {
  const React = await import('react');

  return {
    __esModule: true,
    default: (props: any) => {
      editorPropsSpy(props);

      React.useEffect(() => {
        props.onMount?.({
          layout: editorLayoutSpy,
        });
      }, [props.onMount]);

      return <div data-testid="mock-kowl-editor">{props.value}</div>;
    },
  };
});

describe('KowlJsonView', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined;
  let resizeCallback: ResizeObserverCallback | undefined;
  let currentSize = { width: 640, height: 384 };
  let getBoundingClientRectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    editorLayoutSpy.mockReset();
    editorPropsSpy.mockReset();
    resizeCallback = undefined;
    currentSize = { width: 640, height: 384 };

    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    originalResizeObserver = globalThis.ResizeObserver;
    class ResizeObserverMock {
      observe = vi.fn();
      disconnect = vi.fn();

      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
    }

    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    getBoundingClientRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
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
    vi.unstubAllGlobals();
    getBoundingClientRectSpy.mockRestore();

    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver;
    } else {
      delete (globalThis as typeof globalThis & { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    }
  });

  test('uses the lightweight read-only monaco preset and manually lays out the editor', async () => {
    render(<KowlJsonView srcObj={{ market: 'BSEX' }} />);

    await waitFor(() => {
      expect(editorLayoutSpy).toHaveBeenCalledWith({ width: 640, height: 384 });
    });

    expect(editorPropsSpy).toHaveBeenCalled();
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
    });
  });

  test('relayouts only when the container size changes', async () => {
    render(<KowlJsonView srcObj={{ market: 'BSEX' }} />);

    await waitFor(() => {
      expect(editorLayoutSpy).toHaveBeenCalledTimes(1);
    });

    act(() => {
      resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);
    });

    expect(editorLayoutSpy).toHaveBeenCalledTimes(1);

    currentSize = { width: 800, height: 480 };

    act(() => {
      resizeCallback?.([] as ResizeObserverEntry[], {} as ResizeObserver);
    });

    await waitFor(() => {
      expect(editorLayoutSpy).toHaveBeenCalledTimes(2);
    });

    expect(editorLayoutSpy).toHaveBeenLastCalledWith({ width: 800, height: 480 });
  });
});

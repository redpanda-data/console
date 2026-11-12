import type { Monaco } from '@monaco-editor/react';
import type { editor, IDisposable, IPosition, IRange } from 'monaco-editor';

/** Text and cursor reads needed to recognize a slash, independent of editor rendering. */
export type SlashTextEditor = {
  getPosition: () => IPosition | null;
  getModel: () => Pick<editor.ITextModel, 'getLineContent'> | null;
};

export type SlashContentChange = { changes: Pick<editor.IModelContentChange, 'text'>[] };

/** Subscription/editing capabilities consumed by the slash-command lifecycle. */
export type SlashEditor = SlashTextEditor &
  Pick<editor.IStandaloneCodeEditor, 'executeEdits' | 'focus'> & {
    onDidChangeModelContent: (listener: (event: SlashContentChange) => void) => IDisposable;
  };

/** Cursor insertion and viewport anchoring used by the command palette. */
export type CommandEditor = Omit<SlashTextEditor, 'getModel'> &
  Pick<
    editor.IStandaloneCodeEditor,
    'executeEdits' | 'setPosition' | 'focus' | 'getDomNode' | 'getScrolledVisiblePosition' | 'onDidScrollChange'
  > & {
    getModel: () => Pick<editor.ITextModel, 'getLineContent' | 'getLineMaxColumn' | 'getValue' | 'setValue'> | null;
  };

/** Page-level selection/scroll sync. Keep the full real model for Monaco's marker boundary. */
export type PipelineEditor = Omit<SlashEditor, 'getModel'> &
  Omit<CommandEditor, 'getModel'> &
  Pick<
    editor.IStandaloneCodeEditor,
    | 'revealLineInCenterIfOutsideViewport'
    | 'revealLine'
    | 'onDidContentSizeChange'
    | 'onDidLayoutChange'
    | 'getScrollTop'
    | 'getScrollHeight'
  > & {
    getModel: () => editor.ITextModel | null;
    setSelection: (selection: IRange) => void;
    getLayoutInfo: () => Pick<editor.EditorLayoutInfo, 'height'>;
    onDidChangeCursorPosition: (listener: (event: { position: IPosition }) => void) => IDisposable;
  };

export type MarkerMonaco = {
  MarkerSeverity: Pick<Monaco['MarkerSeverity'], 'Warning'>;
  editor: Pick<Monaco['editor'], 'setModelMarkers'>;
};

import React from 'react';
import Editor, { EditorProps, Monaco } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import merge from 'deepmerge';

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor;

export type { IStandaloneCodeEditor, Monaco }

export default function KowlEditor(props: EditorProps) {
  const { options, ...rest } = props

  const defaultOptions: editor.IStandaloneEditorConstructionOptions = {
    minimap: {
      enabled: false,
    },
    roundedSelection: false,
    padding: {
      top: 0,
    },
    showFoldingControls: 'always',
    glyphMargin: false,
    scrollBeyondLastLine: false,
    cursorBlinking: 'phase',
    lineNumbersMinChars: 4,
    lineDecorationsWidth: 0,
    overviewRulerBorder: false,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
    },
    fontSize: 12,
    occurrencesHighlight: false,
    foldingHighlight: false,
    selectionHighlight: false,
    renderLineHighlight: 'all',
  };

  return (<div style={{ border: '1px solid hsl(0deg, 0%, 90%)', borderRadius: '2px' }}>
    <Editor
      defaultValue={'\n'.repeat(100)}
      options={Object.assign({}, defaultOptions, options ?? {})}
      {...rest}
    />
  </div>)
}

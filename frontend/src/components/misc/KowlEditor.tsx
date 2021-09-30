import React from 'react';
import Editor, {EditorProps} from '@monaco-editor/react';
import {editor} from 'monaco-editor';
import merge from 'deepmerge';

export default function KowlEditor(props: EditorProps) {
  const {options, ...rest} = props

  const defaultOptions: editor.IStandaloneEditorConstructionOptions = {
    readOnly: false,

    minimap: {
      enabled: false,
    },
    roundedSelection: false,
    padding: {
      top: 4,
    },
    showFoldingControls: 'always',
    glyphMargin: false,
    scrollBeyondLastLine: false,
    lineNumbersMinChars: 4,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
    },
    fontSize: 12,
    occurrencesHighlight: false,
    foldingHighlight: false,
    selectionHighlight: false,
  };

  return (<div style={{ border: '1px solid hsl(0deg, 0%, 90%)', borderRadius: '2px' }}>
    <Editor
        options={merge(defaultOptions, options ?? {})}
        {...rest}
    />
  </div>)
}

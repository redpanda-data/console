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

import Editor, { DiffEditor, type DiffEditorProps, type EditorProps } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor;
type IStandaloneDiffEditor = editor.IStandaloneDiffEditor;

export type { IStandaloneCodeEditor, IStandaloneDiffEditor };
export type { EditorProps, Monaco } from '@monaco-editor/react';

export type KowlEditorProps = EditorProps & {
  'data-testid'?: string;
};
export type KowlDiffEditorProps = DiffEditorProps & {};

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
  occurrencesHighlight: 'off',
  foldingHighlight: false,
  selectionHighlight: false,
  renderLineHighlight: 'all',
} as const;

export default function KowlEditor(props: KowlEditorProps) {
  const { options: givenOptions, ...rest } = props;
  const options = { ...defaultOptions, ...(givenOptions ?? {}) };

  return (
    <Editor
      defaultValue={''}
      loading={<LoadingPlaceholder />}
      options={options}
      wrapperProps={{ className: 'kowlEditor' }}
      {...rest}
    />
  );
}

export function KowlDiffEditor(props: KowlDiffEditorProps) {
  const { options: givenOptions, ...rest } = props;
  const options = { ...defaultOptions, ...(givenOptions ?? {}) };

  return (
    <DiffEditor
      loading={<LoadingPlaceholder />}
      options={options}
      wrapperProps={{ className: 'kowlEditor' }}
      {...rest}
    />
  );
}

const LoadingPlaceholder = () => <div className="editorLoading">Loading Editor...</div>;

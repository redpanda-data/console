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

import type { DiffEditorProps, EditorProps, Monaco } from '@monaco-editor/react';
import { LoadingBoundary } from 'components/ui/loading-boundary';
import { useMonacoTheme } from 'hooks/use-monaco-theme';
import type { editor } from 'monaco-editor';
import { lazy, useEffectEvent, useLayoutEffect, useRef } from 'react';

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor;
type IStandaloneDiffEditor = editor.IStandaloneDiffEditor;

export type { EditorProps, Monaco } from '@monaco-editor/react';

export type { IStandaloneCodeEditor, IStandaloneDiffEditor };

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

const LazyEditor = lazy(() => import('./monaco-editor'));
const LazyDiffEditor = lazy(() => import('./monaco-editor').then((m) => ({ default: m.DiffEditor })));

export default function KowlEditor(props: KowlEditorProps) {
  const { options: givenOptions, beforeMount, ...rest } = props;
  const options = { ...defaultOptions, ...(givenOptions ?? {}) };
  const monacoTheme = useMonacoTheme();

  return (
    <LoadingBoundary fallback={<LoadingPlaceholder />}>
      <LazyEditor
        defaultValue={''}
        loading={<LoadingPlaceholder />}
        options={options}
        wrapperProps={{ className: 'kowlEditor' }}
        {...rest}
        beforeMount={(monaco) => {
          monacoTheme.beforeMount(monaco);
          beforeMount?.(monaco);
        }}
        theme={monacoTheme.theme}
      />
    </LoadingBoundary>
  );
}

function useDiffModelCleanup({ keepCurrentOriginalModel, keepCurrentModifiedModel }: KowlDiffEditorProps) {
  const instanceRef = useRef<editor.IDiffEditor | null>(null);
  const detachModels = useEffectEvent(() => {
    const instance = instanceRef.current;
    const models = instance?.getModel();
    if (!(instance && models)) {
      return;
    }
    instance.setModel(null);
    instanceRef.current = null;
    if (!keepCurrentOriginalModel) {
      models.original.dispose();
    }
    if (!(keepCurrentModifiedModel || models.modified.isDisposed())) {
      models.modified.dispose();
    }
  });

  // WARNING: Detach in layout cleanup; the React Monaco adapter disposes models before its editor in passive cleanup.
  useLayoutEffect(() => () => detachModels(), []);

  return (monaco: Monaco) => {
    // WARNING: The adapter calls beforeMount synchronously after creating the diff editor, before assigning its models.
    instanceRef.current = monaco.editor.getDiffEditors().at(-1) ?? null;
  };
}

export function KowlDiffEditor(props: KowlDiffEditorProps) {
  const { options: givenOptions, beforeMount, ...rest } = props;
  const captureCreatedEditor = useDiffModelCleanup(props);
  const options = { ...defaultOptions, ...(givenOptions ?? {}) };
  const monacoTheme = useMonacoTheme();

  return (
    <LoadingBoundary fallback={<LoadingPlaceholder />}>
      <LazyDiffEditor
        loading={<LoadingPlaceholder />}
        options={options}
        wrapperProps={{ className: 'kowlEditor' }}
        {...rest}
        beforeMount={(monaco) => {
          captureCreatedEditor(monaco);
          monacoTheme.beforeMount(monaco);
          beforeMount?.(monaco);
        }}
        theme={monacoTheme.theme}
      />
    </LoadingBoundary>
  );
}

const LoadingPlaceholder = () => <div className="editorLoading">Loading Editor...</div>;

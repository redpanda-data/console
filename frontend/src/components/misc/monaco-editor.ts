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

import MonacoEditor, { type EditorProps, loader } from '@monaco-editor/react';
import { mergeProps } from '@ui-sdk/react/primitive';
import { EditorSurface } from 'components/redpanda-ui/components/editor-surface';
// biome-ignore lint/performance/noNamespaceImport: Monaco's loader needs the complete runtime
import * as monaco from 'monaco-editor';
import { createElement, useRef, useState } from 'react';

// Use `new Worker(new URL(...))` so rsbuild bundles each as its own chunk
// (needed for monaco-yaml's CJS/ESM interop).
window.MonacoEnvironment = {
  getWorker(_workerId, label) {
    switch (label) {
      case 'json':
        return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker', import.meta.url));
      case 'yaml':
        return new Worker(new URL('monaco-yaml/yaml.worker', import.meta.url));
      case 'typescript':
      case 'javascript':
        return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker', import.meta.url));
      default:
        return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker', import.meta.url));
    }
  },
};

// Tell monaco editor where to load dependencies from
loader.config({ monaco });

// biome-ignore lint/performance/noBarrelFile: configure the shared runtime before either editor mounts
export { DiffEditor } from '@monaco-editor/react';

export default function AgentEditor(props: EditorProps) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [ready, setReady] = useState(false);
  const [localValue, setLocalValue] = useState(props.defaultValue ?? '');
  return createElement(EditorSurface, {
    'aria-label': props.options?.ariaLabel ?? `${props.language ?? props.defaultLanguage ?? 'Code'} editor`,
    value: props.value ?? localValue,
    readOnly: !!props.options?.readOnly,
    disabled: !ready,
    onValueChange: (value, details) => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!(editor && model) || editor.getOption(monaco.editor.EditorOption.readOnly)) {
        details.cancel();
        return;
      }
      editor.pushUndoStop();
      if (
        !editor.executeEdits('ui-sdk-agent', [
          { range: model.getFullModelRange(), text: value, forceMoveMarkers: true },
        ])
      ) {
        details.cancel();
      }
      editor.pushUndoStop();
    },
    // Bind the SDK part to Monaco's existing section, preserving flex sizing and percentage heights.
    render: (surfaceProps) =>
      createElement(MonacoEditor, {
        ...props,
        wrapperProps: mergeProps(props.wrapperProps ?? {}, surfaceProps),
        onMount: (editor, runtime) => {
          editorRef.current = editor;
          editor.getContainerDomNode().setAttribute('data-agent-hidden', 'true');
          setReady(true);
          props.onMount?.(editor, runtime);
        },
        onChange: (value, event) => {
          setLocalValue(value ?? '');
          props.onChange?.(value, event);
        },
      }),
  });
}

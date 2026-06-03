/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import Editor, { type EditorProps } from '@monaco-editor/react';
import 'monaco-editor';
import type { editor } from 'monaco-editor';
import type { JSONSchema } from 'monaco-yaml';
import { configureMonacoYaml, type MonacoYaml, type MonacoYamlOptions } from 'monaco-yaml';
import { useEffect, useMemo, useRef } from 'react';

import { normalizePastedWhitespace } from './whitespace';

export type YamlEditorProps = EditorProps & {
  'data-testid'?: string;
  transparentBackground?: boolean;
  onEditorMount?: (editor: editor.IStandaloneCodeEditor) => void;
  schema?: {
    definitions?: Record<string, JSONSchema>;
    properties?: Record<string, JSONSchema>;
  };
};

const defaultOptions: editor.IStandaloneEditorConstructionOptions = {
  minimap: {
    enabled: false,
  },
  fixedOverflowWidgets: true,
  roundedSelection: false,
  padding: {
    top: 8,
  },
  showFoldingControls: 'never',
  glyphMargin: false,
  scrollBeyondLastLine: false,
  cursorBlinking: 'phase',
  lineNumbersMinChars: 3,
  lineDecorationsWidth: 8,
  overviewRulerBorder: false,
  scrollbar: {
    alwaysConsumeMouseWheel: false,
  },
  fontSize: 12,
  occurrencesHighlight: 'off',
  foldingHighlight: false,
  selectionHighlight: false,
  renderLineHighlight: 'all',
  quickSuggestions: {
    other: true,
    comments: true,
    strings: true,
  },
  stickyScroll: {
    enabled: false,
  },
  // EditContext drops textupdate events here, breaking space + suggestions.
  editContext: false,
} as const;

// Give each `anyOf` variant a title (its first property name) so monaco-yaml's
// hover doesn't render `|| || ||` between empty alternatives.
export function annotateAnyOfTitles(node: unknown): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      annotateAnyOfTitles(child);
    }
    return;
  }
  const record = node as Record<string, unknown>;
  const anyOf = record.anyOf;
  if (Array.isArray(anyOf)) {
    for (const variant of anyOf) {
      if (variant && typeof variant === 'object' && !Array.isArray(variant)) {
        const v = variant as Record<string, unknown>;
        if (!v.title && !v.description && !v.markdownDescription) {
          const properties = v.properties as Record<string, unknown> | undefined;
          const firstKey = properties ? Object.keys(properties)[0] : undefined;
          if (firstKey) {
            v.title = firstKey;
          }
        }
      }
    }
  }
  for (const value of Object.values(record)) {
    annotateAnyOfTitles(value);
  }
}

function buildMonacoYamlOptions(
  schema?: YamlEditorProps['schema'],
): MonacoYamlOptions {
  const schemaUri = 'https://raw.githubusercontent.com/redpanda-data/console/refs/heads/master/frontend/src/assets/rp-connect-schema.json';
  const inlineSchema =
    schema?.definitions || schema?.properties
      ? {
          type: 'object' as const,
          ...(schema.definitions && { definitions: schema.definitions }),
          ...(schema.properties && { properties: schema.properties }),
        }
      : { type: 'object' as const };
  annotateAnyOfTitles(inlineSchema);

  return {
    enableSchemaRequest: false,
    format: { enable: true },
    completion: true,
    validate: true,
    schemas: [
      {
        fileMatch: ['**/*.yaml', '**/*.yml'],
        schema: inlineSchema,
        uri: schemaUri,
      },
    ],
  };
}

export const YamlEditor = (props: YamlEditorProps) => {
  const { options: givenOptions, schema, transparentBackground, onEditorMount, ...rest } = props;
  const options = { ...defaultOptions, ...(givenOptions ?? {}) };
  const yamlRef = useRef<MonacoYaml | null>(null);
  const hasInitializedRef = useRef(false);

  const monacoYamlOptions = useMemo<MonacoYamlOptions>(
    () => buildMonacoYamlOptions(schema),
    [schema],
  );

  // Update Monaco YAML when schema changes after initial mount
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }

    yamlRef.current?.update(monacoYamlOptions);
  }, [monacoYamlOptions]);

  useEffect(() => {
    return () => {
      if (yamlRef.current) {
        yamlRef.current.dispose();
      }
    };
  }, []);

  return (
    <Editor
      beforeMount={(monaco) => {
        yamlRef.current = configureMonacoYaml(monaco, monacoYamlOptions);
        if (transparentBackground) {
          monaco.editor.defineTheme('kowl-transparent', {
            base: 'vs',
            inherit: true,
            colors: {
              'editor.background': '#00000000',
              'editorGutter.background': '#00000000',
            },
            rules: [],
          });
        }
      }}
      defaultLanguage="yaml"
      loading={<LoadingPlaceholder />}
      onMount={(editorInstance) => {
        // Invisible space separators (esp. U+00A0) pasted from docs/chat aren't
        // valid YAML indentation and silently break parsing. Replace just the
        // pasted range so config behaves as written.
        editorInstance.onDidPaste((e) => {
          const model = editorInstance.getModel();
          if (!model) {
            return;
          }
          const pasted = model.getValueInRange(e.range);
          const normalized = normalizePastedWhitespace(pasted);
          if (normalized !== pasted) {
            editorInstance.executeEdits('normalize-pasted-whitespace', [{ range: e.range, text: normalized }]);
          }
        });
        onEditorMount?.(editorInstance);
      }}
      options={options}
      path="pipeline.yaml"
      theme={transparentBackground ? 'kowl-transparent' : undefined}
      wrapperProps={{
        style: {
          minWidth: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexBasis: '100%',
        },
      }}
      {...rest}
    />
  );
};

const LoadingPlaceholder = () => <div className="editorLoading">Loading Editor...</div>;

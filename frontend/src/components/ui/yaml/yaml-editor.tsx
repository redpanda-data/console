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

export type YamlEditorProps = EditorProps & {
  'data-testid'?: string;
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
} as const;

function buildMonacoYamlOptions(
  schema?: YamlEditorProps['schema'],
): MonacoYamlOptions {
  const schemaUri = 'https://redpanda.com/connect-schema.json';
  const inlineSchema =
    schema?.definitions || schema?.properties
      ? {
          type: 'object' as const,
          ...(schema.definitions && { definitions: schema.definitions }),
          ...(schema.properties && { properties: schema.properties }),
        }
      : { type: 'object' as const };

  return {
    enableSchemaRequest: false,
    format: true,
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
  const { options: givenOptions, schema, ...rest } = props;
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

  // Cleanup on unmount
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
      }}
      defaultLanguage="yaml"
      loading={<LoadingPlaceholder />}
      options={options}
      path="pipeline.yaml"
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

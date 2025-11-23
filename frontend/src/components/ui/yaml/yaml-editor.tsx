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

import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react';
import 'monaco-editor';
import type { editor } from 'monaco-editor';
import type { JSONSchema } from 'monaco-yaml';
import { configureMonacoYaml, type MonacoYaml, type MonacoYamlOptions } from 'monaco-yaml';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

const defaultFallbackSchema: MonacoYamlOptions = {
  enableSchemaRequest: false,
  format: true,
  completion: true,
  validate: true,
  schemas: [
    {
      fileMatch: ['**/*.yaml', '**/*.yml'],
      schema: {
        type: 'object',
      },
      uri: 'http://example.com/yaml-schema.json',
    },
  ],
};

export const YamlEditor = (props: YamlEditorProps) => {
  const { options: givenOptions, schema, ...rest } = props;
  const options = { ...defaultOptions, ...(givenOptions ?? {}) };
  const [yaml, setYaml] = useState<MonacoYaml | undefined>(undefined);

  // Build Monaco YAML options with schema from props or fallback
  const monacoYamlOptions = useMemo<MonacoYamlOptions>(() => {
    if (schema?.definitions || schema?.properties) {
      return {
        enableSchemaRequest: false,
        format: true,
        completion: true,
        validate: true,
        schemas: [
          {
            fileMatch: ['**/*.yaml', '**/*.yml'],
            schema: {
              type: 'object',
              ...(schema.definitions && { definitions: schema.definitions }),
              ...(schema.properties && { properties: schema.properties }),
            },
            uri: 'https://redpanda-connect-schema.json',
          },
        ],
      };
    }
    return defaultFallbackSchema;
  }, [schema]);

  useEffect(
    () => () => {
      if (yaml) {
        yaml.dispose();
      }
    },
    [yaml]
  );


  const setMonacoOptions = useCallback(
    (monaco: Monaco) => {
      const yamlConfig = configureMonacoYaml(monaco, monacoYamlOptions);
      setYaml(yamlConfig);
    },
    [monacoYamlOptions]
  );

  return (
    <Editor
      beforeMount={(monaco) => setMonacoOptions(monaco)}
      defaultLanguage="yaml"
      loading={<LoadingPlaceholder />}
      options={options}
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

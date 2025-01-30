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

import Editor, { type EditorProps, type Monaco } from '@monaco-editor/react';
import 'monaco-editor';
import type { editor } from 'monaco-editor';
import { type MonacoYaml, type MonacoYamlOptions, configureMonacoYaml } from 'monaco-yaml';
import { useCallback, useEffect, useState } from 'react';
import benthosSchema from '../../assets/rp-connect-schema.json';

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor;
type IStandaloneDiffEditor = editor.IStandaloneDiffEditor;

export type { IStandaloneCodeEditor, IStandaloneDiffEditor, Monaco };

export type PipelinesYamlEditorProps = EditorProps & {
  'data-testid'?: string;
};

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
  quickSuggestions: {
    other: true,
    comments: true,
    strings: true,
  },
} as const;

export const monacoYamlOptions = {
  enableSchemaRequest: false,
  format: true,
  completion: true,
  validate: true,
  schemas: [
    {
      // If YAML file is opened matching this glob
      fileMatch: ['**/*.yaml'],
      // The following schema will be applied
      schema: {
        type: 'object',
        definitions: benthosSchema.definitions,
        properties: benthosSchema.properties,
      },

      // And the URI will be linked to as the source.
      uri: 'http://example.com/redpanda-connect-schema.json', // '../../benthos-schema.json',
    },
  ],
} as MonacoYamlOptions;

export default function PipelinesYamlEditor(props: PipelinesYamlEditorProps) {
  const { options: givenOptions, ...rest } = props;
  const options = Object.assign({}, defaultOptions, givenOptions ?? {});
  const [yaml, setYaml] = useState<MonacoYaml | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (yaml) {
        // avoid duplicate yaml option registration
        yaml.dispose();
      }
    };
  }, [yaml]);

  const setMonacoOptions = useCallback(async (monaco: Monaco) => {
    const yaml = configureMonacoYaml(monaco, monacoYamlOptions);
    setYaml(yaml);
  }, []);

  return (
    <Editor
      loading={<LoadingPlaceholder />}
      wrapperProps={{
        className: 'kowlEditor',
        style: { minWidth: 0, width: '100px', display: 'flex', flexBasis: '100%' },
      }}
      defaultValue={''}
      path={'new-connector.yaml'}
      defaultLanguage="yaml"
      options={options}
      beforeMount={(monaco) => setMonacoOptions(monaco)}
      {...rest}
    />
  );
}

const LoadingPlaceholder = () => <div className="editorLoading">Loading Editor...</div>;

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

import type { EditorProps, Monaco } from '@monaco-editor/react';
import { LoadingBoundary } from 'components/ui/loading-boundary';
import { useMonacoTheme } from 'hooks/use-monaco-theme';
import type { editor } from 'monaco-editor';
import { configureMonacoYaml, type MonacoYaml, type MonacoYamlOptions } from 'monaco-yaml';
import { lazy, useEffect, useMemo, useState } from 'react';
import { useListComponentsQuery } from 'react-query/api/connect';

import benthosSchema from '../../assets/rp-connect-schema.json' with { type: 'json' };
import { useDeprecationMarkers } from '../pages/rp-connect/pipeline/use-deprecation-markers';
import { parseSchema } from '../pages/rp-connect/utils/schema';
import { withYamlDocumentation } from '../pages/rp-connect/utils/yaml-editor-schema';
import { annotateAnyOfTitles } from '../ui/yaml/yaml-editor';

annotateAnyOfTitles(benthosSchema);

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor;
type IStandaloneDiffEditor = editor.IStandaloneDiffEditor;

export type { EditorProps, Monaco } from '@monaco-editor/react';

export type { IStandaloneCodeEditor, IStandaloneDiffEditor };

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

const buildMonacoYamlOptions = (schema: typeof benthosSchema) =>
  ({
    enableSchemaRequest: false,
    format: { enable: true },
    completion: true,
    validate: true,
    schemas: [
      {
        // If YAML file is opened matching this glob
        fileMatch: ['**/*.yaml'],
        // The following schema will be applied
        schema: {
          type: 'object',
          definitions: schema.definitions,
          properties: schema.properties,
        },

        // And the URI will be linked to as the source.
        uri: 'https://github.com/redpanda-data/console/blob/master/frontend/src/assets/rp-connect-schema.json',
      },
    ],
  }) as MonacoYamlOptions;

const LazyEditor = lazy(() => import('./monaco-editor'));

// The live component catalog, applied to the YAML schema's docs once both have loaded.
function useDocumentedCatalog(yaml: MonacoYaml | undefined) {
  const { data: componentResponse } = useListComponentsQuery();
  const componentList = componentResponse?.components;
  const components = useMemo(() => (componentList ? parseSchema(componentList) : undefined), [componentList]);

  useEffect(
    function updateYamlDocumentation() {
      if (yaml && components) {
        // The schema applies before update settles; a failed revalidation only leaves stale markers.
        yaml
          .update(buildMonacoYamlOptions(withYamlDocumentation(benthosSchema, components)))
          .catch((error: unknown) => {
            globalThis.reportError(error);
          });
      }
    },
    [yaml, components]
  );

  return components;
}

export default function PipelinesYamlEditor(props: PipelinesYamlEditorProps) {
  const { options: givenOptions, beforeMount, onMount, onChange, ...rest } = props;
  const options = { ...defaultOptions, ...(givenOptions ?? {}) };
  const monacoTheme = useMonacoTheme();
  const [yaml, setYaml] = useState<MonacoYaml | undefined>(undefined);
  // Callers pass `value` or only `defaultValue`, so track what's typed for the latter.
  const [typedText, setTypedText] = useState<string>();
  const components = useDocumentedCatalog(yaml);
  const deprecations = useDeprecationMarkers(rest.value ?? typedText ?? rest.defaultValue ?? '', components);

  useEffect(() => {
    return () => {
      if (yaml) {
        // avoid duplicate yaml option registration
        yaml.dispose();
      }
    };
  }, [yaml]);

  const setMonacoOptions = (monaco: Monaco) => {
    const yamlConfig = configureMonacoYaml(monaco, buildMonacoYamlOptions(benthosSchema));
    setYaml(yamlConfig);
  };

  return (
    <LoadingBoundary fallback={<LoadingPlaceholder />}>
      <LazyEditor
        defaultLanguage="yaml"
        defaultValue={''}
        loading={<LoadingPlaceholder />}
        options={options}
        path={'new-connector.yaml'}
        wrapperProps={{
          className: 'kowlEditor',
          style: { minWidth: 0, width: '100px', display: 'flex', flexBasis: '100%' },
        }}
        {...rest}
        beforeMount={(monaco) => {
          monacoTheme.beforeMount(monaco);
          setMonacoOptions(monaco);
          beforeMount?.(monaco);
        }}
        onChange={(value, event) => {
          setTypedText(value ?? '');
          onChange?.(value, event);
        }}
        onMount={(instance, monaco) => {
          deprecations.attach(instance, monaco);
          onMount?.(instance, monaco);
        }}
        theme={monacoTheme.theme}
      />
    </LoadingBoundary>
  );
}

const LoadingPlaceholder = () => <div className="editorLoading">Loading Editor...</div>;

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

import type { EditorProps, Monaco } from '@monaco-editor/react';
import { editorTheme } from 'components/redpanda-ui/lib/editor-theme';
import { LoadingBoundary } from 'components/ui/loading-boundary';
import { useThemeAppearance } from 'hooks/use-theme-appearance';
import type { editor } from 'monaco-editor';
import type { JSONSchema } from 'monaco-yaml';
import { configureMonacoYaml, type MonacoYaml, type MonacoYamlOptions } from 'monaco-yaml';
import { lazy, type RefObject, useEffect, useMemo, useRef } from 'react';
import { isNonEmptyString } from 'utils/string-utils';
import { reportActionError } from 'utils/toast.utils';
import { isObject, isUnknownArray, stringValue } from 'utils/type-guards';

import { normalizePastedWhitespace } from './whitespace';

const Editor = lazy(() => import('../../misc/monaco-editor'));

export type YamlEditorProps = EditorProps & {
  'data-testid'?: string;
  transparentBackground?: boolean;
  onEditorMount?: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  schema?: {
    definitions?: JSONSchema['definitions'];
    properties?: JSONSchema['properties'];
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

// Title each `anyOf` variant (first property name) so monaco-yaml's hover
// doesn't render `|| || ||` between empty alternatives.
function annotateVariantTitle(variant: unknown): void {
  if (!isObject(variant) || isUnknownArray(variant)) {
    return;
  }
  if (
    isNonEmptyString(stringValue(variant.title)) ||
    isNonEmptyString(stringValue(variant.description)) ||
    isNonEmptyString(stringValue(variant.markdownDescription))
  ) {
    return;
  }
  const firstKey = isObject(variant.properties) ? Object.keys(variant.properties)[0] : undefined;
  if (firstKey !== undefined && firstKey !== '') {
    variant.title = firstKey;
  }
}

function annotateAlternatives(alternatives: unknown): void {
  if (!isUnknownArray(alternatives)) {
    return;
  }
  for (const variant of alternatives) {
    annotateVariantTitle(variant);
  }
}

export function annotateAnyOfTitles(node: unknown): void {
  if (isUnknownArray(node)) {
    for (const child of node) {
      annotateAnyOfTitles(child);
    }
    return;
  }
  if (!isObject(node)) {
    return;
  }
  annotateAlternatives(node.anyOf);
  const children = Object.values(node);
  for (const child of children) {
    annotateAnyOfTitles(child);
  }
}

function buildMonacoYamlOptions(schema?: YamlEditorProps['schema']): MonacoYamlOptions {
  const schemaUri =
    'https://raw.githubusercontent.com/redpanda-data/console/refs/heads/master/frontend/src/assets/rp-connect-schema.json';
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

/**
 * Monaco's `defineTheme` takes literal colours, so the registry resolves the tokens by painting a
 * probe (redpanda-ui/lib/editor-theme) and picks its `base` from the ground it reads. A snapshot,
 * not a binding — `applyTheme` runs again on every theme flip.
 */
const THEME_NAME = 'redpanda-yaml';

const applyTheme = (monaco: Monaco, transparentBackground: boolean) => {
  monaco.editor.defineTheme(THEME_NAME, editorTheme({ transparentBackground }));
  monaco.editor.setTheme(THEME_NAME);
};

function useYamlTheme(monacoRef: RefObject<Monaco | null>, transparentBackground: boolean | undefined) {
  const appearance = useThemeAppearance();

  // `defineTheme` is global, so re-resolving on a flip re-themes every mounted editor at once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Appearance changes the CSS tokens editorTheme reads from the DOM.
  useEffect(() => {
    if (monacoRef.current) {
      applyTheme(monacoRef.current, transparentBackground ?? false);
    }
  }, [appearance, transparentBackground]);
}

export const YamlEditor = (props: YamlEditorProps) => {
  const { options: givenOptions, schema, transparentBackground, onEditorMount, ...rest } = props;
  const options = { ...defaultOptions, ...givenOptions };
  const yamlRef = useRef<MonacoYaml | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const hasInitializedRef = useRef(false);
  useYamlTheme(monacoRef, transparentBackground);

  const monacoYamlOptions = useMemo<MonacoYamlOptions>(() => buildMonacoYamlOptions(schema), [schema]);

  // Re-apply options when schema changes after mount.
  useEffect(() => {
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      return;
    }

    yamlRef.current?.update(monacoYamlOptions).catch(reportActionError);
  }, [monacoYamlOptions]);

  useEffect(
    () => () => {
      if (yamlRef.current) {
        yamlRef.current.dispose();
      }
    },
    []
  );

  return (
    <LoadingBoundary fallback={<LoadingPlaceholder />}>
      <Editor
        beforeMount={(monaco) => {
          monacoRef.current = monaco;
          yamlRef.current = configureMonacoYaml(monaco, monacoYamlOptions);
          applyTheme(monaco, transparentBackground ?? false);
        }}
        defaultLanguage="yaml"
        loading={<LoadingPlaceholder />}
        onMount={(editorInstance, monaco) => {
          // Normalize invisible spaces in the pasted range (see whitespace.ts).
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
          onEditorMount?.(editorInstance, monaco);
        }}
        options={options}
        path="pipeline.yaml"
        theme={THEME_NAME}
        wrapperProps={{
          className: 'flex min-w-0 size-full basis-full',
        }}
        {...rest}
      />
    </LoadingBoundary>
  );
};

const LoadingPlaceholder = () => <div className="editorLoading">Loading Editor...</div>;

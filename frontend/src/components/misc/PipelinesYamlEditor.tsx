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

import { EditorProps, Monaco } from '@monaco-editor/react';
import monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { MonacoYamlOptions } from 'monaco-yaml';
import benthosSchema from '../../assets/rp-connect-schema.json';
import { useEffect, useRef } from 'react';
type IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;
type IStandaloneDiffEditor = monaco.editor.IStandaloneDiffEditor;

export type { IStandaloneCodeEditor, IStandaloneDiffEditor, Monaco }

export type PipelinesYamlEditorProps = EditorProps & {
    'data-testid'?: string;
};

const defaultOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
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
        strings: true
    },
    formatOnType: true,
} as const;

export const monacoYamlOptions = {
    enableSchemaRequest: false,
    format: true,
    completion: true,
    validate: true,
    schemas: [
        {
            fileMatch: ['*'],
            schema: {
                type: 'object',
                definitions: benthosSchema.definitions,
                properties: benthosSchema.properties,
            },
            uri: 'http://example.com/schema-name.json', // '../../benthos-schema.json',
        }
    ]
} as MonacoYamlOptions;
  
export default function PipelinesYamlEditor({ options: givenOptions, ...rest }: PipelinesYamlEditorProps) {
    const options = Object.assign({}, defaultOptions, givenOptions ?? {});

    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let monacoEditorYaml: monaco.editor.IStandaloneCodeEditor;

        if (ref.current) {
            monacoEditorYaml = monaco.editor.create(ref.current, {
                ...options,
                ...rest,
                automaticLayout: true,
                language: 'yaml',
            });
        }

        return () => {
            monacoEditorYaml.dispose();
        }
    }, [options, rest]);

    return <div ref={ref} className="kowlEditor" style={{ minWidth: 0, width: '100px', display: 'flex', flexBasis: '100%' }} />
}

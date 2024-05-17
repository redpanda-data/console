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

import React from 'react';
import Editor, { EditorProps, Monaco, loader } from '@monaco-editor/react';
import 'monaco-editor';
import { editor } from 'monaco-editor';
import { MonacoYamlOptions, configureMonacoYaml } from 'monaco-yaml';
// import yamlWorker from "worker-loader!monaco-yaml/yaml.worker";


// eslint-disable-next-line import/no-webpack-loader-syntax
// import EditorWorker from 'worker-loader!monaco-editor/esm/vs/editor/editor.worker.js';
// import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

// eslint-disable-next-line import/no-webpack-loader-syntax
// import YamlWorker from 'worker-loader!monaco-yaml/lib/esm/yaml.worker.js';

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor;
type IStandaloneDiffEditor = editor.IStandaloneDiffEditor;

export type { IStandaloneCodeEditor, IStandaloneDiffEditor, Monaco }

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
} as const;

const monacoYamlOptions = {
    enableSchemaRequest: true,
    format: true,
    completion: true,
    validate: true,
    schemas: [
        // {
        //     // If YAML file is opened matching this glob
        //     fileMatch: ['**/.prettierrc.*'],
        //     // Then this schema will be downloaded from the internet and used.
        //     uri: 'https://json.schemastore.org/prettierrc.json'
        // },
        {
            // If YAML file is opened matching this glob
            fileMatch: ['**/*.yaml'],
            // The following schema will be applied

            // schema: {
            //     type: 'object',
            //     properties: benthosSchema.config
            // },

            // schema: {
            //     type: 'object',
            //     properties: {
            //         twoToSeven: {
            //             type: 'number',
            //             minimum: 2,
            //             maximum: 7
            //         },
            //         oneOfColors: {
            //             type: 'string',
            //             oneOf: ['red', 'green', 'blue'],
            //         },
            //         someNumArr: {
            //             type: 'array',
            //             anyOf: [1, 2, 3, 4, 5, 6]
            //         }
            //     }
            // },

            // And the URI will be linked to as the source.
            uri: '../../benthos-schema.json',
        }
    ]
} as MonacoYamlOptions;

loader.init().then(async (monaco) => {
    window.MonacoEnvironment = {
        getWorker(moduleId, label) {
            console.log(`window.MonacoEnvironment.getWorker looking for moduleId ${moduleId} label ${label}`);
            switch (label) {
                case 'editorWorkerService':
                    console.log('returning normal worker service...', { importMetaUrl: import.meta.url });
                    return new Worker(
                        new URL(
                            'monaco-editor/esm/vs/editor/editor.worker',
                            import.meta.url
                        )
                    );
                case 'yaml':
                    console.log('returning yaml worker service...', { importMetaUrl: import.meta.url });
                    // return new yamlWorker();
                    return new Worker(
                        new URL(
                            'monaco-yaml/yaml.worker',
                            import.meta.url
                        )
                    );

                default:
                    throw new Error(`Unknown label ${label}`);
            }
        },
    };
    configureMonacoYaml(monaco, monacoYamlOptions);
});


export default function PipelinesYamlEditor(props: PipelinesYamlEditorProps) {
    const { options: givenOptions, ...rest } = props;
    const options = Object.assign({}, defaultOptions, givenOptions ?? {});

    return <Editor
        loading={<LoadingPlaceholder />}
        wrapperProps={{ className: 'kowlEditor' }}
        defaultValue={''}
        options={options}
        {...rest}

    // onMount={(editor, monaco) => {
    //     configureMonacoYaml(monaco, monacoYamlOptions);
    //     rest.onMount?.(editor, monaco);
    // }}
    />
}



const LoadingPlaceholder = () => <div className="editorLoading">
    Loading Editor...
</div>

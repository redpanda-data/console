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
    quickSuggestions: {
        other: true,
        comments: true,
        strings: true
    }
} as const;

const monacoYamlOptions = {
    enableSchemaRequest: false,
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

            schema: {
                '$schema': 'http://json-schema.org/draft-07/schema#',
                'additionalProperties': false,
                'type': 'object',
                'properties': {
                    'input': {
                        '$comment': 'Test comment',
                        'description': 'An input is a source of data piped through an array of optional processors. Only one input is configured at the root of a Benthos config. However, the root input can be a broker which combines multiple inputs and merges the streams.',
                        'oneOf': [
                            {
                                'type': 'object',
                                'properties': {
                                    'kafka_franz': {
                                        'type': 'object',
                                        'description': 'A Kafka input using the Franz Kafka client library.',
                                        'properties': {
                                            'seed_brokers': {
                                                'type': 'array',
                                                'description': 'A list of broker addresses used for the initial connection.',
                                                'items': {
                                                    'type': 'string'
                                                }
                                            },
                                            'group_id': {
                                                'type': 'string',
                                                'description': 'Consumer group ID'
                                            },
                                            'topics': {
                                                'type': 'array',
                                                'description': 'A list of Kafka topics to consume from.',
                                                'items': {
                                                    'type': 'string'
                                                }
                                            },
                                            'client_id': {
                                                'type': 'string',
                                                'description': 'Kafka client ID, used for self-identifying in the cluster.',
                                                'default': 'redpanda-connect'
                                            }
                                        },
                                        'required': ['seed_brokers'],
                                        'additionalProperties': false
                                    }
                                },
                                'required': ['kafka_franz'],
                                'additionalProperties': false
                            },
                            {
                                'type': 'object',
                                'properties': {
                                    'stdin': {
                                        'type': 'object',
                                        'default': {},
                                        'additionalProperties': false
                                    }
                                },
                                'required': ['stdin'],
                                'additionalProperties': false
                            }
                        ]
                    },
                    'pipeline': {
                        'type': 'object',
                        'description': 'Pipeline configuration, including processors.',
                        'properties': {
                            'processors': {
                                'type': 'array',
                                'items': {
                                    'type': 'object',
                                    'properties': {
                                        'type': {
                                            'type': 'string',
                                            'enum': ['bloblang', 'log', 'filter', 'map', 'unarchive'],
                                            'description': 'The type of processor'
                                        },
                                        'bloblang': {
                                            'type': 'object',
                                            'properties': {
                                                'mapping': {
                                                    'type': 'string',
                                                    'description': 'Bloblang mapping'
                                                }
                                            },
                                            'required': ['mapping'],
                                            'additionalProperties': false
                                        }
                                    },
                                    'required': ['type'],
                                    'oneOf': [
                                        {
                                            'properties': {
                                                'type': {
                                                    'enum': ['bloblang']
                                                },
                                                'bloblang': {
                                                    'type': 'object',
                                                    'properties': {
                                                        'mapping': {
                                                            'type': 'string',
                                                            'description': 'Bloblang mapping'
                                                        }
                                                    },
                                                    'required': ['mapping'],
                                                    'additionalProperties': false
                                                }
                                            }
                                        }
                                    ]
                                }
                            }
                        },
                        'required': ['processors'],
                        'additionalProperties': false
                    }
                },
                'required': ['input', 'pipeline']
            },

            // And the URI will be linked to as the source.
            uri: 'http://example.com/schema-name.json', // '../../benthos-schema.json',
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

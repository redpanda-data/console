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

import Editor, { EditorProps, Monaco } from '@monaco-editor/react';
import 'monaco-editor';
import { editor } from 'monaco-editor';
import { MonacoYamlOptions } from 'monaco-yaml';
import benthosSchema from '../../assets/rp-connect-schema.json';

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
            uri: 'http://example.com/schema-name.json', // '../../benthos-schema.json',
        }
    ]
} as MonacoYamlOptions;

// const linter = {
//     editor: undefined as undefined | IStandaloneCodeEditor,
//     monaco: undefined as undefined | Monaco,
//
//     isLinting: false,
//     text: '',
//
//     async refreshLint() {
//         if (!this.editor) return;
//         const monaco = this.monaco;
//         if (!monaco) return;
//         if (this.isLinting) return;
//
//         const model = this.editor.getModel();
//         if (!model) return;
//
//         // Save the text into a local variable, so we can compare/know if we need to lint again
//         const lintedText = this.text;
//
//         this.isLinting = true;
//         const r = await pipelinesApi.lintConfig(lintedText).catch(() => null);
//         this.isLinting = false;
//         if (!r) return;  // do nothing, don't care about fetching errors here
//
//         // Update the results
//         const markers = r.lints.map(l => {
//             return {
//                 message: l.reason,
//                 startLineNumber: l.line,
//                 endLineNumber: l.line,
//                 startColumn: l.column,
//                 endColumn: l.column + 4,
//                 severity: MarkerSeverity.Error,
//             } as editor.IMarkerData;
//         });
//
//         monaco.editor.setModelMarkers(model, 'owner', markers);
//
//         // Maybe, while we were linting, the user has modified the text?
//         // If so, this function didn't run (because of the isLinting check at the start)
//         // So we need to lint the new config
//         if (this.text != lintedText)
//             this.refreshLint();
//     }
// };

export default function PipelinesYamlEditor(props: PipelinesYamlEditorProps) {
    const { options: givenOptions, ...rest } = props;
    const options = Object.assign({}, defaultOptions, givenOptions ?? {});

    return <Editor

        loading={<LoadingPlaceholder />}
        wrapperProps={{ className: 'kowlEditor', style: { minWidth: 0, width: '100px', display: 'flex', flexBasis: '100%' } }}
        defaultValue={''}
        defaultLanguage="yaml"

        options={options}
        {...rest}

        // onChange={(v, ev) => {
        //     if (v) {
        //         linter.text = v;
        //         linter.refreshLint();
        //     }
        //     rest.onChange?.(v, ev);
        // }}

        // onMount={(editor, monaco) => {
        //     linter.editor = editor;
        //     linter.monaco = monaco;
        // }}
    />
}

const LoadingPlaceholder = () => <div className="editorLoading">
    Loading Editor...
</div>

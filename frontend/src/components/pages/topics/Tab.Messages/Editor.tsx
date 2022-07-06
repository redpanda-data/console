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

import { FC, useRef, useState } from 'react';
import { OnMount, OnChange, BeforeMount } from '@monaco-editor/react';
import { Uri, languages, editor } from 'monaco-editor';
import KowlEditor, { IStandaloneCodeEditor } from '../../../misc/KowlEditor';

interface FilterEditorProps {
    value: string;
    onValueChange: (code: string, transpiledCode: string) => void;
}

const options: editor.IStandaloneEditorConstructionOptions  = {
    lineNumbers: 'off',
};

const FilterEditor: FC<FilterEditorProps> = ({ value, onValueChange }) => {
    const [isEditorReady, setIsEditorReady] = useState<boolean>(false);
    const [editorUri, setEditorUri] = useState<Uri>();
    const [tsWorkerClient, setTsWorkerClient] = useState<languages.typescript.TypeScriptWorker>();

    const editorRef = useRef<undefined | IStandaloneCodeEditor>();

    const handleOnMount: OnMount = async (editor, monaco) => {
        editorRef.current = editor;
        if (!isEditorReady) {
            const uri = editorRef.current?.getModel()?.uri;
            setEditorUri(uri);
            const worker = await monaco?.languages.typescript.getTypeScriptWorker();
            const client = await worker();
            setTsWorkerClient(client);
        }
        setIsEditorReady(true);
    };

    const handleBeforeMount: BeforeMount = (monaco) => {
        const libSource = `
            /**
            * Is a position within a partition for the next message to be sent to a consumer. 
            * A simple integer number which is to maintain the current position of a consumer.    
            */
            const offset: number;
            /** 
            * integer id of a topic partition, eatch partition holds a subset of records owned by a topic
            */
            const partitionId: number;

            const key: string;
            const value: any | null;
            const headers: any | null;
        `;
        const libUri = 'ts:filename/definitions.ts';
        if (!monaco.editor.getModel(monaco.Uri.parse(libUri))) {
            monaco.languages.typescript.javascriptDefaults.addExtraLib(libSource, libUri);
            monaco.editor.createModel(libSource, 'typescript', monaco.Uri.parse(libUri));
        }
        if (!isEditorReady) {
            monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                target: monaco.languages.typescript.ScriptTarget.ES3,
                module: monaco.languages.typescript.ModuleKind.ES2015,
                removeComments: true,
                allowNonTsExtensions: true,
                lib: ['es2018'],
            });
            monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                diagnosticCodesToIgnore: [1108],
            });
        }
    };

    const getEditorValue = async () => editorRef.current?.getValue();

    const handleValueChange: OnChange = async () => {
        const editorValue = (await getEditorValue()) ?? '';
        const result = await tsWorkerClient!.getEmitOutput(editorUri!.toString());
        setImmediate(() => onValueChange(editorValue, result.outputFiles[0].text));
    };

    return (
        <KowlEditor
            value={value}
            height={200}
            width="100%"
            onMount={handleOnMount}
            onChange={handleValueChange}
            beforeMount={handleBeforeMount}
            language="typescript"
            theme="vs-light"
            options={options}
        />
    );
};

export default FilterEditor;


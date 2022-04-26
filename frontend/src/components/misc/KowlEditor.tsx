import React, { CSSProperties } from 'react';
import Editor, { EditorProps, Monaco } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import merge from 'deepmerge';

type IStandaloneCodeEditor = editor.IStandaloneCodeEditor;

export type { IStandaloneCodeEditor, Monaco }

export type KowlEditorProps = EditorProps & {

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
    occurrencesHighlight: false,
    foldingHighlight: false,
    selectionHighlight: false,
    renderLineHighlight: 'all',
} as const;

export default function KowlEditor(props: KowlEditorProps) {
    const { options: givenOptions, ...rest } = props
    const options = Object.assign({}, defaultOptions, givenOptions ?? {});


    return <Editor
        loading={<LoadingPlaceholder />}
        wrapperProps={{ className: 'kowlEditor' }}
        defaultValue={'\n'.repeat(2)}
        options={options}
        {...rest}
    />
}

const LoadingPlaceholder = () => <div className='editorLoading'>
    Loading Editor...
</div>
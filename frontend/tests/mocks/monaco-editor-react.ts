import { createElement } from 'react';

// Browser-mode tests exercise the real Monaco integration. Node unit and
// happy-dom integration tests use this lightweight surface so importing the
// route tree does not initialize Monaco's unresolved process-wide loader.
export const loader = {
  config: () => undefined,
};

type MockEditorProps = {
  defaultValue?: string;
  onChange?: (value: string | undefined) => void;
  value?: string;
};

const Editor = ({ defaultValue, onChange, value }: MockEditorProps) =>
  createElement('textarea', {
    'data-testid': 'monaco-editor-mock',
    defaultValue,
    onChange: (event: { currentTarget: { value: string } }) => onChange?.(event.currentTarget.value),
    value,
  });

export const DiffEditor = Editor;
export const useMonaco = () => null;
export default Editor;

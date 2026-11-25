import type { IStandaloneCodeEditor, KowlEditorProps } from './kowl-editor';
import { KowlEditor } from './kowl-editor';

export type JsonViewEditorProps = Pick<KowlEditorProps, 'options' | 'value'> & {
  onMount: (editor: Pick<IStandaloneCodeEditor, 'layout'>) => void;
};

/** The JSON viewer only owns layout, not Monaco's editable-document API. */
export function JsonViewEditor({ onMount, options, value }: JsonViewEditorProps) {
  return <KowlEditor language="json" onMount={onMount} options={options} value={value} />;
}

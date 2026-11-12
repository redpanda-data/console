import { YamlEditor } from 'components/ui/yaml/yaml-editor';
import type { ComponentProps } from 'react';

import type { MarkerMonaco, PipelineEditor } from './pipeline-editor-port';

/** The pipeline owns only these editor capabilities; the underlying editor remains real Monaco. */
export type PipelineYamlEditorProps = Omit<ComponentProps<typeof YamlEditor>, 'onEditorMount' | 'onChange'> & {
  onChange?: (value: string | undefined) => void;
  onEditorMount?: (instance: PipelineEditor, monaco: MarkerMonaco) => void;
};

export function PipelineYamlEditor(props: PipelineYamlEditorProps) {
  return <YamlEditor {...props} />;
}

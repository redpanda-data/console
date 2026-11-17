'use client';

import type { OptionsOf, StateOf } from '@ui-sdk/core';
import { useFieldControl } from '@ui-sdk/react/field';
import { type PartProps, renderElement, usePart, usePrimitive } from '@ui-sdk/react/primitive';

import { commitAgentChange } from '../lib/commit-agent-change';
import { editorSurface } from '../lib/primitives/editor-surface';

type EditorSurfaceProps = OptionsOf<typeof editorSurface> & PartProps<'div', StateOf<typeof editorSurface, 'root'>>;

function EditorSurface({ value, readOnly, disabled, onValueChange, render, ...props }: EditorSurfaceProps) {
  const field = useFieldControl({ id: props.id });
  const handle = usePrimitive(editorSurface, {
    value,
    readOnly,
    disabled: disabled || field?.disabled,
    onValueChange: (next, details) => commitAgentChange(onValueChange, next, details),
  });
  const partProps: PartProps<'div', StateOf<typeof editorSurface, 'root'>> & { 'data-agent-secret': string } = {
    ...props,
    'data-agent-secret': 'true',
    render: (elementProps, state) =>
      renderElement('div', field ? field.props(elementProps) : elementProps, render, state),
  };
  return usePart(handle, 'root', {}, partProps, 'div');
}

export { EditorSurface };

'use client';

import { createParts } from '@ui-sdk/react/primitive';
import type { ComponentProps } from 'react';
import { withAgentChanges } from '../lib/commit-agent-change';
import { editorSurface } from '../lib/primitives/editor-surface';

const { Root } = createParts(editorSurface, { root: 'div' });
function EditorSurface(props: ComponentProps<typeof Root>) {
  return <Root {...withAgentChanges(props)} data-agent-secret="true" />;
}
export { EditorSurface };

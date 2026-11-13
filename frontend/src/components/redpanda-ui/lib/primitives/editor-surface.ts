import { createChange, definePrimitive, type ChangeDetails } from '@ui-sdk/core';

type EditorOptions = {
  value: string;
  readOnly?: boolean;
  disabled?: boolean;
  onValueChange: (value: string, details: ChangeDetails<'imperative'>) => void;
};
export const editorSurface = definePrimitive({
  name: 'code-editor',
  options: { value: 'string', readOnly: 'boolean', disabled: 'boolean', onValueChange: 'callback' },
  controlled: ['value'],
  state: (options: EditorOptions) => ({
    value: options.value,
    readOnly: !!options.readOnly,
    disabled: !!options.disabled,
  }),
  sync: (options: EditorOptions) => ({
    value: options.value,
    readOnly: !!options.readOnly,
    disabled: !!options.disabled,
  }),
  api: (context) => {
    const change = createChange(context);
    return {
      setValue: (value: string) => {
        const state = context.store.get();
        if (state.readOnly || state.disabled || typeof value !== 'string') return false;
        return change('value', value, { reason: 'imperative' });
      },
    };
  },
  slots: (slot) => ({
    root: slot({ attrs: (state) => ({ role: 'group', 'aria-disabled': state.disabled ? 'true' : undefined }) }),
  }),
  // Configuration and message editors can contain credentials or record payloads.
  agent: { actions: ['setValue'], secret: true },
});

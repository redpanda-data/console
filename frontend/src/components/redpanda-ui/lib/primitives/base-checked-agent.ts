import { type ChangeDetails, createChange, definePrimitive } from '@ui-sdk/core';

export type BaseCheckedDetails = ChangeDetails<'selection' | 'imperative'>;
export function defineBaseCheckedAgent(name: string) {
  type Options = {
    checked?: boolean;
    defaultChecked?: boolean;
    indeterminate?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    onCheckedChange?: (checked: boolean, details: BaseCheckedDetails) => void;
  };
  return definePrimitive({
    name,
    options: {
      checked: 'boolean',
      defaultChecked: 'boolean',
      indeterminate: 'boolean',
      disabled: 'boolean',
      readOnly: 'boolean',
      onCheckedChange: 'callback',
    },
    controlled: ['checked'],
    state: (options: Options) => ({
      checked: options.indeterminate
        ? ('indeterminate' as const)
        : (options.checked ?? options.defaultChecked ?? false),
      disabled: !!options.disabled,
      readOnly: !!options.readOnly,
    }),
    sync: (options: Options) => {
      const checked = options.indeterminate ? ('indeterminate' as const) : options.checked;
      return {
        ...(checked === undefined ? {} : { checked }),
        disabled: !!options.disabled,
        readOnly: !!options.readOnly,
      };
    },
    api: (context) => {
      const change = createChange(context);
      return {
        setChecked: (checked: boolean, event?: Event) => {
          const state = context.store.get();
          if (state.disabled || state.readOnly || typeof checked !== 'boolean') {
            return false;
          }
          if (event !== undefined && !(event instanceof Event)) {
            return false;
          }
          return change('checked', checked, { reason: event ? 'selection' : 'imperative', event });
        },
      };
    },
    slots: (slot) => ({
      root: slot<object, { checked: boolean | 'indeterminate' }>({ state: (state) => ({ checked: state.checked }) }),
    }),
    agent: { actions: ['setChecked'] },
  });
}
export const baseCheckboxAgent = defineBaseCheckedAgent('checkbox');
export const baseSwitchAgent = defineBaseCheckedAgent('switch');

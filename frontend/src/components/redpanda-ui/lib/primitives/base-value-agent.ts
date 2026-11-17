import { type ChangeDetails, createChange, definePrimitive } from '@ui-sdk/core';

export type BaseValueDetails = ChangeDetails<'selection' | 'imperative'>;
export type AgentItem = { value: string; label: string; disabled?: boolean };

export function defineBaseValueAgent<Value>(name: string, initialValue: Value, closed = false) {
  type Options = {
    value?: Value;
    defaultValue?: Value;
    disabled?: boolean;
    readOnly?: boolean;
    items?: AgentItem[];
    onValueChange?: (value: Value, details: BaseValueDetails) => void;
    valid: (value: unknown) => boolean;
  };
  return definePrimitive({
    name,
    options: {
      value: 'value',
      defaultValue: 'value',
      disabled: 'boolean',
      readOnly: 'boolean',
      items: 'value',
      onValueChange: 'callback',
      valid: 'action',
    },
    controlled: ['value'],
    state: (options: Options) => ({
      value: options.value ?? options.defaultValue ?? initialValue,
      disabled: !!options.disabled,
      readOnly: !!options.readOnly,
      items: options.items ?? ([] as AgentItem[]),
    }),
    sync: (options: Options) => ({
      ...(options.value === undefined ? {} : { value: options.value }),
      disabled: !!options.disabled,
      readOnly: !!options.readOnly,
      ...(options.items ? { items: options.items } : {}),
    }),
    api: (context) => {
      const change = createChange(context);
      return {
        open: () => {
          const state = context.store.get();
          const trigger = context.element('trigger');
          if (state.disabled || state.readOnly || !trigger) {
            return false;
          }
          if (trigger.getAttribute('aria-expanded') !== 'true') {
            trigger.click();
          }
          return true;
        },
        setValue: (value: Value, event?: Event) => {
          const state = context.store.get();
          if (state.disabled || state.readOnly || !context.options().valid(value)) {
            return false;
          }
          const values = Array.isArray(value) ? value : [value];
          const previous = Array.isArray(state.value) ? state.value : [state.value];
          if (event !== undefined && !(event instanceof Event)) {
            return false;
          }
          if (
            closed &&
            !event &&
            values.some(
              (candidate) =>
                candidate !== null &&
                // Selected items can disappear from filtered/async options; only additions need validation.
                !previous.includes(candidate) &&
                !state.items.some((item) => item.value === candidate && !item.disabled)
            )
          ) {
            return false;
          }
          return change('value', value, { reason: event ? 'selection' : 'imperative', event });
        },
      };
    },
    // Empty slots deliberately add no keyboard, focus, popup or ARIA behavior over Base UI.
    slots: (slot) => ({
      root: slot<object, { value: Value }>({ state: (state) => ({ value: state.value }) }),
      trigger: slot({}),
      item: slot<{ value: string; disabled?: boolean }>({
        props: { value: 'key', disabled: 'boolean' },
        bind: (el, part) => {
          const { value } = part.props;
          const item = { value, label: el.textContent?.trim() || value, disabled: part.props.disabled };
          const items = part.store.get().items.filter((entry) => entry.value !== value);
          part.store.set({ items: [...items, item] });
          return () => {
            part.store.set({ items: part.store.get().items.filter((entry) => entry.value !== value) });
          };
        },
      }),
    }),
    agent: {
      actions: ['select', 'multi-select', 'combobox'].includes(name) ? ['setValue', 'open'] : ['setValue'],
      closed,
    },
  });
}

export const baseSelectAgent = defineBaseValueAgent<string | null>('select', null, true);
export const baseTabsAgent = defineBaseValueAgent<string | null>('tabs', null, true);
export const baseToggleGroupAgent = defineBaseValueAgent<string[]>('toggle-group', [], true);
export const baseRadioGroupAgent = defineBaseValueAgent<string>('radio-group', '', true);
export const baseMultiSelectAgent = defineBaseValueAgent<string[]>('multi-select', [], true);
export const baseComboboxAgent = defineBaseValueAgent<string | null>('combobox', null, true);

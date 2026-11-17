import {
  type ChangeDetails,
  createChange,
  createReorder,
  definePrimitive,
  type ReorderDraft,
  type ReorderReason,
} from '@ui-sdk/core';

type SortableOptions = {
  value: string[];
  onValueChange: (value: string[], details: ChangeDetails<ReorderReason>) => void;
};
export const sortable = definePrimitive({
  name: 'sortable-list',
  options: { value: 'list', onValueChange: 'callback' },
  controlled: ['value'],
  state: (options: SortableOptions) => ({ value: options.value, moving: null as ReorderDraft | null }),
  sync: (options: SortableOptions) => ({ value: options.value }),
  api: (context) => {
    const change = createChange(context);
    const reorder = createReorder(context, {
      slot: 'item',
      key: 'value',
      draft: 'moving',
      preview: true,
      set: (value, details) => change('value', value, details),
    });
    return {
      reorder,
      move: (key: string, index: number) => {
        const value = context.store.get().value;
        if (
          typeof key !== 'string' ||
          !value.includes(key) ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= value.length
        )
          return false;
        return reorder.move(key, index);
      },
      getValue: () => context.store.get().value,
    };
  },
  slots: (slot) => ({
    root: slot<{}, { order: string[] }>({
      attrs: () => ({ role: 'list' }),
      state: (state, { api }) => ({ order: api.reorder.order(state) }),
    }),
    item: slot<{ value: string }>({
      props: { value: 'string' },
      attrs: (state, { key, api }) => ({
        role: 'listitem',
        'data-grabbed': api.reorder.moving(state, key) ? '' : undefined,
      }),
      bind: (element, part) => part.api.reorder.bind(element, part),
    }),
    handle: slot<{ value: string }>({
      props: { value: 'string' },
      attrs: () => ({ type: 'button' }),
      on: {
        pointerdown: (event, { api, key }) => api.reorder.pointerdown(event, key),
        keydown: (event, { api, key }) => {
          api.reorder.keydown(event, key);
        },
      },
    }),
  }),
  agent: { actions: ['move'], items: (api) => api.getValue().map((value) => ({ value, label: value })) },
});

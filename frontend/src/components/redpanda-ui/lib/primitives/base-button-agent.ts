import { type ChangeDetails, definePrimitive, dispatch } from '@ui-sdk/core';

type Options = {
  disabled?: boolean;
  activate: () => unknown;
  onPress: (_: undefined, details: ChangeDetails<'press'>) => void;
};

// Metadata only: Base UI owns activation, focus, keyboard handling and ARIA.
function defineBasePressAgent(name: string) {
  return definePrimitive({
    name,
    options: { disabled: 'boolean', activate: 'action', onPress: 'callback' },
    controlled: [],
    state: (options: Options) => ({ disabled: !!options.disabled, pending: false, error: undefined as unknown }),
    sync: (options: Options) => ({ disabled: !!options.disabled }),
    api: (context) => {
      let alive = true;
      context.onDestroy(() => {
        alive = false;
      });
      const perform = () => {
        const state = context.store.get();
        return state.disabled || state.pending ? false : context.options().activate();
      };
      return {
        press: perform,
        activate: (...args: unknown[]) => (args.length ? false : perform()),
        notify: (event: MouseEvent) => dispatch(context, 'onPress', undefined, { reason: 'press', event }),
        track: (result: PromiseLike<unknown>) => {
          context.store.set({ pending: true, error: undefined });
          Promise.resolve(result).then(
            () => {
              if (alive) {
                context.store.set({ pending: false });
              }
            },
            (error: unknown) => {
              if (alive) {
                context.store.set({ pending: false, error });
              }
            }
          );
        },
      };
    },
    slots: (slot) => ({
      root: slot<object, { pending: boolean }>({ state: (state) => ({ pending: state.pending }) }),
    }),
    agent: { actions: name === 'button' ? ['press'] : ['activate'] },
  });
}
export const baseButtonAgent = defineBasePressAgent('button');
// Custom action discovery must match the styled Base UI root's data-slot.
export const baseMenuItemAgent = defineBasePressAgent('console-menu-action');

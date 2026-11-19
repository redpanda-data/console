'use client';

// Copyright 2026 Redpanda Data, Inc.

import {
  type ToastManager,
  type ToastManagerEvent,
  type ToastManagerPromiseOptions,
  type ToastManagerUpdateOptions,
  Toast as ToastPrimitive,
} from '@base-ui/react/toast';

export function resolveToastOptions<Data extends object>(options: string | ToastManagerUpdateOptions<Data>) {
  return typeof options === 'string' ? { title: options } : options;
}

/** Retain notifications until a viewport subscribes, including child mount effects. */
export function createToastManager<Data extends object = object>(): ToastManager<Data> {
  const manager = ToastPrimitive.createToastManager<Data>();
  type Listener = Parameters<(typeof manager)[' subscribe']>[0];
  const listeners = new Set<Listener>();
  const pending: ToastManagerEvent[] = [];

  manager[' subscribe']((event) => {
    if (listeners.size === 0) {
      pending.push(event);
      return;
    }
    for (const listener of listeners) {
      listener(event);
    }
  });

  return {
    ...manager,
    promise<Value, T extends Data = Data>(promise: Promise<Value>, options: ToastManagerPromiseOptions<Value, T>) {
      const id = manager.add({ ...resolveToastOptions(options.loading), type: 'loading' });
      return promise
        .then((value) => {
          const resolved = typeof options.success === 'function' ? options.success(value) : options.success;
          const terminalOptions = resolveToastOptions(resolved);
          manager.update(id, { ...terminalOptions, type: 'success', timeout: terminalOptions.timeout });
          return value;
        })
        .catch((error: unknown) => {
          const resolved = typeof options.error === 'function' ? options.error(error) : options.error;
          const terminalOptions = resolveToastOptions(resolved);
          manager.update(id, { ...terminalOptions, type: 'error', timeout: terminalOptions.timeout });
          throw error;
        });
    },
    ' subscribe'(listener: Listener) {
      listeners.add(listener);
      const queued = pending.splice(0);
      for (const event of queued) {
        listener(event);
      }
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const toast = createToastManager();

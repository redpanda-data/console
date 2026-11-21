import type { ChangeDetails } from '@ui-sdk/core';
import { usePrimitive } from '@ui-sdk/react/primitive';
import { type MouseEvent, useRef } from 'react';
import { flushSync } from 'react-dom';

import { baseButtonAgent, baseMenuItemAgent } from './primitives/base-button-agent';

export function useBasePressAgent<Event extends MouseEvent<HTMLElement>>(
  onClick: ((event: Event, details: ChangeDetails<'press'>) => unknown) | undefined,
  disabled?: boolean,
  kind: 'button' | 'menu-item' = 'button'
) {
  const element = useRef<HTMLElement | null>(null);
  const event = useRef<Event | null>(null);
  const result = useRef<unknown>(undefined);
  const handle = usePrimitive(kind === 'button' ? baseButtonAgent : baseMenuItemAgent, {
    disabled,
    activate: () => {
      if (!element.current) {
        return false;
      }
      result.current = undefined;
      flushSync(() => element.current?.click());
      return result.current ?? true;
    },
    onPress: (_, details) => {
      if (!event.current) {
        details.cancel();
        return;
      }
      result.current = onClick?.(event.current, details);
      if (result.current instanceof Promise) {
        handle.api.track(result.current);
      }
    },
  });
  return {
    handle,
    ref: element,
    onClick: (pressed: Event) => {
      event.current = pressed;
      if (handle.api.notify(pressed.nativeEvent)) {
        pressed.preventDefault();
      }
    },
  };
}

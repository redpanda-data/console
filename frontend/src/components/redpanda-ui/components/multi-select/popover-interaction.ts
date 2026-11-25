// Copyright 2026 Redpanda Data, Inc.

import type { Popover } from '@base-ui/react/popover';

/** Focus-out events originate on the departing popup; their related target identifies the destination. */
export function getPopoverInteractionTarget(details: Popover.Root.ChangeEventDetails): EventTarget | null {
  const event = details.event;
  if (details.reason === 'focus-out' && event instanceof FocusEvent) {
    return event.relatedTarget;
  }
  return event.target;
}

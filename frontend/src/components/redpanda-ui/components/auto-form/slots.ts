// Copyright 2026 Redpanda Data, Inc.

import type { ReactNode } from 'react';
import { requireUniqueItemIds } from '../../lib/identified-items';
import type { ParsedField } from './core-types';

/** Caller-owned identity and explicit placement; field anchors address root schema keys. */
export type AutoFormSlotDescriptor = {
  id: string;
  content: ReactNode;
} & ({ placement: 'start' } | { placement: 'before' | 'after'; field: string });

export const EMPTY_AUTO_FORM_SLOTS: readonly AutoFormSlotDescriptor[] = [];

/** Validate against all root fields, not a mode/step projection that may legitimately hide an anchor. */
export function validateAutoFormSlots(slots: readonly AutoFormSlotDescriptor[], fields: readonly ParsedField[]): void {
  requireUniqueItemIds(slots);
  const fieldKeys = new Set(fields.map((field) => field.key));
  for (const slot of slots) {
    const placement = slot.placement;
    switch (placement) {
      case 'start':
        break;
      case 'before':
      case 'after':
        if (!fieldKeys.has(slot.field)) {
          throw new RangeError(`AutoForm slot "${slot.id}" targets an unknown root field: "${slot.field}".`);
        }
        break;
      default:
        throw new TypeError('Unsupported AutoForm slot placement.', { cause: placement satisfies never });
    }
  }
}

export function indexAutoFormSlots(slots: readonly AutoFormSlotDescriptor[]): {
  start: AutoFormSlotDescriptor[];
  before: Map<string, AutoFormSlotDescriptor[]>;
  after: Map<string, AutoFormSlotDescriptor[]>;
} {
  const start: AutoFormSlotDescriptor[] = [];
  const before = new Map<string, AutoFormSlotDescriptor[]>();
  const after = new Map<string, AutoFormSlotDescriptor[]>();
  for (const slot of slots) {
    if (slot.placement === 'start') {
      start.push(slot);
    } else {
      const map = slot.placement === 'before' ? before : after;
      const entries = map.get(slot.field) ?? [];
      entries.push(slot);
      map.set(slot.field, entries);
    }
  }
  return { start, before, after };
}

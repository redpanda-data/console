import type { ReactNode } from 'react';

/** Keep zero-valued content; never consume iterables or unwrap promises to inspect a slot. */
export function hasSlotContent(value: ReactNode): boolean {
  return value !== undefined && value !== null && typeof value !== 'boolean' && value !== '';
}

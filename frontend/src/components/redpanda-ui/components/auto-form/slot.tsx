'use client';

import type React from 'react';

type AutoFormSlotProps = {
  /** Render this slot before the field with this key */
  before?: string;
  /** Render this slot after the field with this key */
  after?: string;
  children: React.ReactNode;
};

function AutoFormSlot({ children }: AutoFormSlotProps) {
  // Marker component: AutoFormFields reads its props for placement; it never renders standalone.
  return <>{children}</>;
}

AutoFormSlot.displayName = 'AutoFormSlot';

export { AutoFormSlot, type AutoFormSlotProps };

'use client';

import { createParts } from '@ui-sdk/react/primitive';
import type { ComponentProps, ReactNode } from 'react';
import { sortable } from '../lib/primitives/sortable';

const parts = createParts(sortable, { root: 'div', item: 'div', handle: 'button' });
type SortableListProps = Omit<ComponentProps<typeof parts.Root>, 'children'> & {
  children: (order: string[]) => ReactNode;
};
function SortableList({ children, ...props }: SortableListProps) {
  return <parts.Root {...props}>{(state) => children(state.order)}</parts.Root>;
}
const SortableItem = parts.Item;
const SortableHandle = parts.Handle;

export { SortableHandle, SortableItem, SortableList };

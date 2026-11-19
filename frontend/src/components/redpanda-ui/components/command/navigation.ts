// Copyright 2026 Redpanda Data, Inc.

import { isValidElement, type KeyboardEvent, type ReactNode } from 'react';
import { type CommandStore, navigableGroups, navigableItems } from './store';

/**
 * The keydown `keyCode` an IME reports while it composes. Safari ends composition just before the
 * committing Enter, which then reads `isComposing: false`; only this code marks it. A recorded
 * exception to the no-deprecated rule allows `keyCode`.
 */
const IME_PROCESS_KEY_CODE = 229;

/** Whether a keydown belongs to IME composition rather than the command. */
export function isComposingKey(event: KeyboardEvent): boolean {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === IME_PROCESS_KEY_CODE;
}

export type NavigationIntent = 'first' | 'last' | 'next' | 'next-group' | 'previous' | 'previous-group' | 'select';

function stepIntent(event: KeyboardEvent, direction: 'next' | 'previous'): NavigationIntent {
  if (event.metaKey) {
    return direction === 'next' ? 'last' : 'first';
  }
  if (event.altKey) {
    return direction === 'next' ? 'next-group' : 'previous-group';
  }
  return direction;
}

export function navigationIntent(event: KeyboardEvent, vimBindings: boolean): NavigationIntent | undefined {
  const vim = vimBindings && event.ctrlKey;
  switch (event.key) {
    case 'ArrowDown':
      return stepIntent(event, 'next');
    case 'ArrowUp':
      return stepIntent(event, 'previous');
    case 'n':
    case 'j':
      return vim ? stepIntent(event, 'next') : undefined;
    case 'p':
    case 'k':
      return vim ? stepIntent(event, 'previous') : undefined;
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'Enter':
      return 'select';
    default:
      return;
  }
}

export function itemValueOf(item: HTMLElement | undefined): string | undefined {
  return item?.getAttribute('data-value') ?? undefined;
}

function isNodeList(node: ReactNode): node is Iterable<ReactNode> {
  return typeof node === 'object' && node !== null && Symbol.iterator in node;
}

/** The text an item renders, for items without an explicit `value` before their DOM exists. */
export function textFromNode(root: ReactNode): string {
  let text = '';
  // Depth-first, in document order: children are pushed reversed so the first one pops next.
  const pending: ReactNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'bigint') {
      text += String(node);
    } else if (isValidElement<{ children?: ReactNode }>(node)) {
      pending.push(node.props.children);
    } else if (isNodeList(node)) {
      pending.push(...Array.from(node).toReversed());
    }
  }
  return text;
}

export interface ReconciledItems {
  itemsVersion: number;
  search: string;
  /** The values of the navigable items the reconcile saw. */
  values: ReadonlySet<string>;
}

/**
 * As in cmdk: typing, an empty highlight, or removing the highlighted item moves the highlight to
 * the first item. A value that hasn't appeared yet (items still loading, a sentinel) is left alone.
 * Removal checks the current highlight against every item the last reconcile saw, because keys,
 * the pointer, or a click whose `onSelect` removes the item move the highlight between reconciles.
 */
export function movesHighlight(previous: ReconciledItems, next: ReconciledItems, value: string): boolean {
  if (previous.search !== next.search || value === '') {
    return true;
  }
  return previous.values.has(value) && !next.values.has(value);
}

function stepTarget(items: HTMLElement[], index: number, offset: 1 | -1, loop: boolean): HTMLElement | undefined {
  if (index === -1) {
    return offset === 1 ? items[0] : items.at(-1);
  }
  const next = index + offset;
  if (next >= 0 && next < items.length) {
    return items[next];
  }
  if (!loop) {
    return;
  }
  return offset === 1 ? items[0] : items.at(-1);
}

/** Resolves a navigation key to the item it highlights or activates. */
export function navigationTarget(
  store: CommandStore,
  root: HTMLElement | null,
  intent: NavigationIntent,
  loop: boolean
): HTMLElement | undefined {
  const items = navigableItems(store, root);
  const current = store.getValue();
  const index = items.findIndex((item) => itemValueOf(item) === current);
  if (intent === 'first') {
    return items[0];
  }
  if (intent === 'last') {
    return items.at(-1);
  }
  if (intent === 'select') {
    return items[index];
  }
  if (intent === 'next' || intent === 'previous') {
    return stepTarget(items, index, intent === 'next' ? 1 : -1, loop);
  }
  // Alt+arrow jumps to the first item of the neighbouring group; outside a group it steps one item, as in cmdk.
  const offset = intent === 'next-group' ? 1 : -1;
  const groups = navigableGroups(store, root);
  const selected = items[index];
  const groupIndex = groups.findIndex((group) => selected !== undefined && group.includes(selected));
  if (groupIndex === -1) {
    return stepTarget(items, index, offset, loop);
  }
  return groups[groupIndex + offset]?.[0] ?? stepTarget(items, index, offset, loop);
}

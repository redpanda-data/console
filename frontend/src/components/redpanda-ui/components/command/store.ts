// Copyright 2026 Redpanda Data, Inc.

/** Scores how well `search` matches an item. Zero hides the item; while searching, higher scores rank first. */
export type CommandFilter = (value: string, search: string, keywords?: string[]) => number;

const SEPARATORS = /[\s-]+/gu;
const EXACT_SCORE = 1;
const PREFIX_SCORE = 0.9;
const WORD_PREFIX_SCORE = 0.8;
const SUBSTRING_SCORE = 0.7;
const SUBSEQUENCE_SCORE = 0.5;

/** Whitespace and hyphens compare equal, so `data table` finds `data-table`. */
function normalize(text: string): string {
  return text.toLowerCase().replace(SEPARATORS, ' ');
}

function scoreText(text: string, query: string): number {
  if (text === query) {
    return EXACT_SCORE;
  }
  if (text.startsWith(query)) {
    return PREFIX_SCORE;
  }
  const index = text.indexOf(query);
  if (index > 0) {
    return text.charAt(index - 1) === ' ' ? WORD_PREFIX_SCORE : SUBSTRING_SCORE;
  }
  // Typeahead abbreviations: every query character, in order, anywhere in the text.
  let cursor = 0;
  let start = -1;
  for (const character of query) {
    const found = text.indexOf(character, cursor);
    if (found === -1) {
      return 0;
    }
    if (start === -1) {
      start = found;
    }
    cursor = found + character.length;
  }
  return SUBSEQUENCE_SCORE * (query.length / (cursor - start));
}

/** Case-insensitive, in-order character matching against the value and its keywords; closer matches score higher. */
export function defaultCommandFilter(value: string, search: string, keywords: string[] = []): number {
  const query = normalize(search).trim();
  if (query === '') {
    return EXACT_SCORE;
  }
  const candidates = keywords.length === 0 ? [value] : [value, ...keywords, [value, ...keywords].join(' ')];
  return Math.max(0, ...candidates.map((candidate) => scoreText(normalize(candidate), query)));
}

/** cmdk's name for the default scorer, for filters that wrap it. Lives here because component modules export only components and hooks. */
export const defaultFilter: CommandFilter = defaultCommandFilter;

export interface CommandItemRecord {
  disabled: boolean;
  forceMount: boolean;
  groupId: string | undefined;
  /** The filter's score; it ranks visible items while searching. */
  score: number;
  value: string;
  visible: boolean;
}

interface CommandStoreOptions {
  controlled: boolean;
  onValueChange: ((value: string) => void) | undefined;
  /** Whether matches rank by score while searching (`shouldFilter`). */
  ranked: boolean;
  /** Asks the command to re-render, so item changes from one commit reach subscribers in one notification. */
  requestFlush: (() => void) | undefined;
}

/** An item's place in rank order: its slot in the list (its own, or its group's), then its slot within the group. */
export type CommandRank = readonly [number, number];

export interface CommandStore {
  /** Publishes pending item changes, if any. Returns whether it notified subscribers. */
  flush: () => boolean;
  getGroupOrder: (groupId: string) => number | undefined;
  getItemOrder: (itemId: string) => number | undefined;
  getItemsVersion: () => number;
  getListElement: () => HTMLElement | null;
  /** The id the rendered list carries, a caller's or the command's own, for the input's `aria-controls`. */
  getListId: () => string | undefined;
  getRank: (itemId: string) => CommandRank;
  getSearch: () => string;
  getSelectedId: () => string | undefined;
  getValue: () => string;
  getVisibleCount: () => number;
  isGroupVisible: (groupId: string) => boolean;
  owns: (itemId: string) => boolean;
  removeItem: (itemId: string) => void;
  /** Runs an item's selection, as a click or Enter does. */
  select: (itemId: string) => void;
  setItem: (itemId: string, record: CommandItemRecord) => void;
  setListElement: (element: HTMLElement | null) => void;
  setListId: (id: string | undefined) => void;
  setOptions: (options: CommandStoreOptions) => void;
  setSearch: (search: string) => void;
  setSelectHandler: (itemId: string, select: () => void) => void;
  /** A user-driven highlight: reports through `onValueChange` and waits for the prop when controlled. */
  setValue: (value: string) => void;
  subscribe: (listener: () => void) => () => void;
  /** Mirrors a controlled `value` prop without reporting it back. */
  syncValue: (value: string) => void;
}

function sameRecord(left: CommandItemRecord, right: CommandItemRecord): boolean {
  return (
    left.disabled === right.disabled &&
    left.forceMount === right.forceMount &&
    left.groupId === right.groupId &&
    left.score === right.score &&
    left.value === right.value &&
    left.visible === right.visible
  );
}

type ScoredId = [id: string, score: number];
type RankedGroup = [groupId: string, bestScore: number, firstRendered: number];

/**
 * cmdk's ranking: ungrouped matches first, by score, then groups by their best match, with
 * each group's items by score. Ties keep the order they render in. `forceMount` items rank
 * before their siblings, as cmdk left them in place while it moved ranked items after them.
 */
function rankItems(
  items: ReadonlyMap<string, CommandItemRecord>,
  renderOrder: ReadonlyMap<string, number>
): {
  groupOrders: Map<string, number>;
  itemOrders: Map<string, number>;
} {
  const rendered = (id: string) => renderOrder.get(id) ?? Number.MAX_SAFE_INTEGER;
  const byScore = (left: ScoredId, right: ScoredId) => {
    const difference = right[1] - left[1];
    return difference === 0 ? rendered(left[0]) - rendered(right[0]) : difference;
  };
  const loose: ScoredId[] = [];
  const grouped = new Map<string, ScoredId[]>();
  const forced: string[] = [];
  for (const [id, record] of items) {
    if (!record.visible) {
      continue;
    }
    if (record.forceMount) {
      forced.push(id);
      continue;
    }
    if (record.groupId === undefined) {
      loose.push([id, record.score]);
    } else {
      const entries = grouped.get(record.groupId) ?? [];
      entries.push([id, record.score]);
      grouped.set(record.groupId, entries);
    }
  }
  // An explicit 0, or the item would inherit its group's `--cmdk-order` through the cascade.
  const itemOrders = new Map<string, number>(forced.map((id) => [id, 0]));
  for (const [index, [id]] of loose.toSorted(byScore).entries()) {
    itemOrders.set(id, index + 1);
  }
  // Tied groups keep the order they render in: by their first rendered item, not the order items registered.
  const groupBest: RankedGroup[] = [];
  for (const [groupId, entries] of grouped) {
    const sorted = entries.toSorted(byScore);
    for (const [index, [id]] of sorted.entries()) {
      itemOrders.set(id, index + 1);
    }
    const firstRendered = entries.reduce((first, [id]) => Math.min(first, rendered(id)), Number.MAX_SAFE_INTEGER);
    groupBest.push([groupId, sorted[0]?.[1] ?? 0, firstRendered]);
  }
  const byBestMatch = (left: RankedGroup, right: RankedGroup) => {
    const difference = right[1] - left[1];
    return difference === 0 ? left[2] - right[2] : difference;
  };
  const groupOrders = new Map<string, number>();
  for (const [index, [groupId]] of groupBest.toSorted(byBestMatch).entries()) {
    groupOrders.set(groupId, loose.length + index + 1);
  }
  return { groupOrders, itemOrders };
}

/** Each item's position in the rendered list, for breaking ranking ties the way they render. */
function renderedItemOrder(list: HTMLElement | null): Map<string, number> {
  const order = new Map<string, number>();
  if (list === null) {
    return order;
  }
  const elements = Array.from(list.querySelectorAll('[cmdk-item]'));
  for (const [index, element] of elements.entries()) {
    order.set(element.id, index);
  }
  return order;
}

/** The first visible item with this value: the highlighted one. */
function visibleItemWithValue(items: ReadonlyMap<string, CommandItemRecord>, value: string): string | undefined {
  for (const [itemId, record] of items) {
    if (record.visible && record.value === value) {
      return itemId;
    }
  }
  return undefined;
}

/** Search, highlight, ranking and item visibility for one `Command`; items register themselves after they commit. */
export function createCommandStore(initialValue: string): CommandStore {
  const listeners = new Set<() => void>();
  const items = new Map<string, CommandItemRecord>();
  const selectHandlers = new Map<string, () => void>();
  const visibleGroupCounts = new Map<string, number>();
  let options: CommandStoreOptions = {
    controlled: false,
    onValueChange: undefined,
    ranked: true,
    requestFlush: undefined,
  };
  let search = '';
  let value = initialValue;
  let visibleCount = 0;
  let itemsVersion = 0;
  let dirty = false;
  let groupOrders = new Map<string, number>();
  let itemOrders = new Map<string, number>();
  let listElement: HTMLElement | null = null;
  let listId: string | undefined;
  let selectedIdCache: { itemsVersion: number; value: string; id: string | undefined } | undefined;

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  // One notification per commit: notifying on every registration costs O(n²) on large lists.
  const markDirty = () => {
    dirty = true;
    options.requestFlush?.();
  };

  const account = (record: CommandItemRecord, change: 1 | -1) => {
    if (!record.visible) {
      return;
    }
    // `forceMount` items stay out of the empty-state count, as in cmdk: they render whatever the search.
    if (!record.forceMount) {
      visibleCount += change;
    }
    if (record.groupId !== undefined) {
      visibleGroupCounts.set(record.groupId, (visibleGroupCounts.get(record.groupId) ?? 0) + change);
    }
  };

  return {
    flush: () => {
      if (!dirty) {
        return false;
      }
      dirty = false;
      if (options.ranked && search !== '') {
        ({ groupOrders, itemOrders } = rankItems(items, renderedItemOrder(listElement)));
      } else {
        groupOrders = new Map();
        itemOrders = new Map();
      }
      itemsVersion += 1;
      emit();
      return true;
    },
    getGroupOrder: (groupId) => groupOrders.get(groupId),
    getItemOrder: (itemId) => itemOrders.get(itemId),
    getItemsVersion: () => itemsVersion,
    getListElement: () => listElement,
    getListId: () => listId,
    getRank: (itemId) => {
      const groupId = items.get(itemId)?.groupId;
      const own = itemOrders.get(itemId) ?? 0;
      return groupId === undefined ? [own, 0] : [groupOrders.get(groupId) ?? 0, own];
    },
    getSearch: () => search,
    getSelectedId: () => {
      // No highlight selects nothing, not an item without a value (an icon-only item).
      if (value === '') {
        return;
      }
      if (selectedIdCache?.itemsVersion === itemsVersion && selectedIdCache.value === value) {
        return selectedIdCache.id;
      }
      const id = visibleItemWithValue(items, value);
      selectedIdCache = { itemsVersion, value, id };
      return id;
    },
    getValue: () => value,
    getVisibleCount: () => visibleCount,
    isGroupVisible: (groupId) => (visibleGroupCounts.get(groupId) ?? 0) > 0,
    owns: (itemId) => items.has(itemId),
    removeItem: (itemId) => {
      const previous = items.get(itemId);
      selectHandlers.delete(itemId);
      if (previous === undefined) {
        return;
      }
      account(previous, -1);
      items.delete(itemId);
      markDirty();
    },
    select: (itemId) => {
      selectHandlers.get(itemId)?.();
    },
    setItem: (itemId, record) => {
      const previous = items.get(itemId);
      if (previous !== undefined && sameRecord(previous, record)) {
        return;
      }
      if (previous !== undefined) {
        account(previous, -1);
      }
      items.set(itemId, record);
      account(record, 1);
      markDirty();
    },
    setListElement: (element) => {
      listElement = element;
    },
    setListId: (next) => {
      if (next === listId) {
        return;
      }
      listId = next;
      emit();
    },
    setOptions: (next) => {
      options = next;
    },
    setSearch: (next) => {
      if (next === search) {
        return;
      }
      search = next;
      emit();
      // Ranks depend on the search itself, even when no item's score changes.
      markDirty();
    },
    setSelectHandler: (itemId, handler) => {
      selectHandlers.set(itemId, handler);
    },
    setValue: (next) => {
      if (next === value) {
        return;
      }
      if (!options.controlled) {
        value = next;
        emit();
      }
      options.onValueChange?.(next);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    syncValue: (next) => {
      if (next === value) {
        return;
      }
      value = next;
      emit();
    },
  };
}

const ITEM_SELECTOR = '[cmdk-item]';
const GROUP_SELECTOR = '[cmdk-group]';
const NATIVE_CONTROL_SELECTOR =
  'button, a[href], input, select, textarea, summary, [contenteditable=""], [contenteditable="true"]';
const SEARCH_FIELD_TYPES = new Set(['email', 'search', 'tel', 'text', 'url']);

/** A single-line text field outside the items drives the command like its input, as any input did in cmdk. */
function isSearchField(target: Element): boolean {
  return (
    target instanceof HTMLInputElement && SEARCH_FIELD_TYPES.has(target.type) && target.closest(ITEM_SELECTOR) === null
  );
}

function scopesFor(store: CommandStore, root: HTMLElement | null): HTMLElement[] {
  const list = store.getListElement();
  const scopes = root === null ? [] : [root];
  // A portaled list sits outside the root, so it is searched as well.
  if (list !== null && (root === null || !root.contains(list))) {
    scopes.push(list);
  }
  return scopes;
}

function isNavigable(store: CommandStore, element: HTMLElement): boolean {
  return store.owns(element.id) && element.getAttribute('aria-disabled') !== 'true';
}

function compareRanks(left: CommandRank, right: CommandRank): number {
  const bySlot = left[0] - right[0];
  return bySlot === 0 ? left[1] - right[1] : bySlot;
}

/**
 * Enabled items this command owns, in displayed order: rank order while searching, which the
 * parts render with CSS `order`, else document order. Nested commands' items are excluded.
 */
export function navigableItems(store: CommandStore, root: HTMLElement | null): HTMLElement[] {
  const items: HTMLElement[] = [];
  for (const scope of scopesFor(store, root)) {
    for (const element of scope.querySelectorAll<HTMLElement>(ITEM_SELECTOR)) {
      if (isNavigable(store, element)) {
        items.push(element);
      }
    }
  }
  return items.toSorted((left, right) => compareRanks(store.getRank(left.id), store.getRank(right.id)));
}

/** This command's groups in displayed order, each with its enabled items in displayed order. */
export function navigableGroups(store: CommandStore, root: HTMLElement | null): HTMLElement[][] {
  const groups = new Map<Element, HTMLElement[]>();
  for (const item of navigableItems(store, root)) {
    const group = item.closest(GROUP_SELECTOR);
    if (group !== null) {
      const items = groups.get(group) ?? [];
      items.push(item);
      groups.set(group, items);
    }
  }
  return [...groups.values()];
}

/**
 * Whether a keyboard event belongs to this command rather than a nested command or a native control.
 * Keys pressed on buttons and links (an empty-state action, a dialog's close button) keep their native behavior,
 * as do fields inside items; a custom search field in place of `CommandInput` drives the command.
 */
export function ownsKeyboardTarget(store: CommandStore, root: HTMLElement | null, target: EventTarget | null): boolean {
  if (!(target instanceof Element) || root === null) {
    return false;
  }
  const owner = target.closest('[cmdk-root]');
  const list = store.getListElement();
  const inScope = owner === root || (owner === null && list?.contains(target) === true);
  if (!inScope) {
    return false;
  }
  return target.hasAttribute('cmdk-input') || isSearchField(target) || target.closest(NATIVE_CONTROL_SELECTOR) === null;
}

/** The item shown first in its group brings the heading along. Ranking reorders items with CSS, so compare positions. */
function scrollTargetFor(item: HTMLElement): HTMLElement {
  const group = item.closest(GROUP_SELECTOR);
  if (group === null) {
    return item;
  }
  const heading = group.querySelector<HTMLElement>('[cmdk-group-heading]');
  if (heading === null) {
    return item;
  }
  const top = item.getBoundingClientRect().top;
  const shownFirst = Array.from(group.querySelectorAll(ITEM_SELECTOR)).every(
    (other) => other === item || other.getBoundingClientRect().top >= top
  );
  return shownFirst ? heading : item;
}

/** Keyboard moves scroll the item into view, as cmdk did. */
export function scrollItemIntoView(item: HTMLElement): void {
  if (typeof item.scrollIntoView !== 'function') {
    return;
  }
  scrollTargetFor(item).scrollIntoView({ block: 'nearest' });
  item.scrollIntoView({ block: 'nearest' });
}

/** Scrolls only the list, so a highlight that moves as you type never scrolls the page. */
export function scrollItemIntoList(store: CommandStore, item: HTMLElement): void {
  const list = store.getListElement();
  if (list === null) {
    return;
  }
  const bounds = list.getBoundingClientRect();
  const top = scrollTargetFor(item).getBoundingClientRect().top;
  const bottom = item.getBoundingClientRect().bottom;
  if (top < bounds.top) {
    list.scrollTop -= bounds.top - top;
  } else if (bottom > bounds.bottom) {
    list.scrollTop += bottom - bounds.bottom;
  }
}

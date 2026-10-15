import type { ComboboxOption } from './index';

/** Selection value of the "Create" row, kept apart from every consumer option value. */
export const CREATE_ITEM_VALUE = '__combobox_create__';

/** The "Create" row: its label is the typed text, so the list filter always keeps it. */
export interface ComboboxCreateItem {
  readonly create: true;
  readonly label: string;
  readonly value: typeof CREATE_ITEM_VALUE;
}

export type ComboboxListItem = ComboboxOption | ComboboxCreateItem;

/** One section of the list. Options without a `group` share a section with an empty heading. */
export interface ComboboxListGroup {
  readonly heading: string;
  readonly items: readonly ComboboxListItem[];
  readonly key: string;
  readonly testId?: string;
}

export const isCreateItem = (item: ComboboxListItem): item is ComboboxCreateItem => 'create' in item;

/** Group options by their `group` field, preserving first-seen order. */
export const groupOptions = (options: readonly ComboboxOption[]): ComboboxListGroup[] => {
  const groups = new Map<string, { items: ComboboxOption[]; testId?: string }>();
  for (const option of options) {
    const heading = option.group ?? '';
    const group = groups.get(heading);
    if (group) {
      group.items.push(option);
    } else {
      groups.set(heading, { items: [option], testId: option.groupTestId });
    }
  }
  return Array.from(groups, ([heading, group]) => ({
    heading,
    items: group.items,
    key: `group:${heading}`,
    testId: group.testId,
  }));
};

/** Whether `text` names something new: not blank, not the current value, not an existing option. */
export const canCreateOption = (options: readonly ComboboxOption[], text: string, value: string): boolean => {
  const query = text.trim();
  if (query === '' || query === value) {
    return false;
  }
  const lowerQuery = query.toLowerCase();
  return !options.some(
    (option) => option.value.toLowerCase() === lowerQuery || option.label.toLowerCase() === lowerQuery
  );
};

/** The sections Base UI renders: the grouped options, plus a trailing "Create" section when offered. */
export const buildListGroups = (
  options: readonly ComboboxOption[],
  createText: string | undefined
): ComboboxListGroup[] => {
  const groups = groupOptions(options);
  if (createText === undefined) {
    return groups;
  }
  const createItem: ComboboxCreateItem = { create: true, label: createText, value: CREATE_ITEM_VALUE };
  return [...groups, { heading: '', items: [createItem], key: 'create' }];
};

import type { ComboboxOption } from './index';

/** Prefix for the creatable item's cmdk value to distinguish from real options. */
export const CREATE_ITEM_PREFIX = '__create__';

export type GroupedOptions = {
  readonly heading: string;
  readonly testId?: string;
  readonly options: ReadonlyArray<ComboboxOption>;
};

/** Resolve a controlled value to its display label. */
export const resolveLabel = (options: ReadonlyArray<ComboboxOption>, value: string): string => {
  const opt = options.find((o) => o.value === value);
  return opt?.label ?? value;
};

/** Filter options by a case-insensitive query against label and value. */
export const filterOptions = (
  options: ReadonlyArray<ComboboxOption>,
  query: string,
  selectedLabel: string
): ComboboxOption[] => {
  if (!query) {
    return [...options];
  }
  // If input matches the selected option's label exactly, show all options
  if (query === selectedLabel && selectedLabel) {
    return [...options];
  }
  const lowerQuery = query.toLowerCase();
  return options.filter(
    (option) => option.label.toLowerCase().includes(lowerQuery) || option.value.toLowerCase().includes(lowerQuery)
  );
};

/** Group options by their `group` field, preserving insertion order. Returns undefined if no groups exist. */
export const groupOptions = (options: ReadonlyArray<ComboboxOption>): GroupedOptions[] | undefined => {
  if (!options.some((option) => option.group)) {
    return;
  }

  const groups = new Map<string, GroupedOptions>();
  for (const option of options) {
    const groupKey = option.group || '';
    const existing = groups.get(groupKey);
    if (existing) {
      groups.set(groupKey, { ...existing, options: [...existing.options, option] });
    } else {
      groups.set(groupKey, {
        heading: groupKey,
        options: [option],
        testId: option.groupTestId,
      });
    }
  }
  return Array.from(groups.values());
};

/** Build the flat list of navigable cmdk values for keyboard navigation. */
export const getNavigableValues = (
  filteredOptions: ReadonlyArray<ComboboxOption>,
  canCreate: boolean,
  inputValue: string
): string[] => {
  const base = filteredOptions.map((opt) => opt.label);
  return canCreate ? [...base, `${CREATE_ITEM_PREFIX}${inputValue}`] : base;
};

/** Compute the next highlight value with circular wrapping. */
export const computeNextHighlight = (
  navigableValues: ReadonlyArray<string>,
  currentHighlight: string,
  direction: 1 | -1
): string => {
  if (navigableValues.length === 0) {
    return '';
  }
  const currentIndex = navigableValues.findIndex((v) => v.toLowerCase() === currentHighlight.toLowerCase());
  let nextIndex: number;
  if (currentIndex === -1) {
    nextIndex = direction === 1 ? 0 : navigableValues.length - 1;
  } else {
    nextIndex = currentIndex + direction;
    if (nextIndex < 0) {
      nextIndex = navigableValues.length - 1;
    }
    if (nextIndex >= navigableValues.length) {
      nextIndex = 0;
    }
  }
  return navigableValues[nextIndex];
};

/** Find the first matching option for a query string (used for auto-highlight on type). */
export const findFirstMatch = (options: ReadonlyArray<ComboboxOption>, query: string): string => {
  if (!query) {
    return '';
  }
  const lowerQuery = query.toLowerCase();
  const match = options.find(
    (opt) => opt.label.toLowerCase().includes(lowerQuery) || opt.value.toLowerCase().includes(lowerQuery)
  );
  return match?.label ?? '';
};

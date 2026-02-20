/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

// ── Types ──────────────────────────────────────────────────────────────

export type FilterType = 'text' | 'option' | 'multiOption';

export type TextFilterOperator = 'contains' | 'does not contain';
export type OptionFilterOperator = 'is' | 'is not' | 'is any of' | 'is none of';
export type MultiOptionFilterOperator = 'include' | 'exclude' | 'include any of' | 'include all of';

export type FilterOperators = {
  text: TextFilterOperator;
  option: OptionFilterOperator;
  multiOption: MultiOptionFilterOperator;
};

export type FilterOperatorTarget = 'single' | 'multiple';

export type FilterOperatorDetails<T extends FilterType = FilterType> = {
  value: FilterOperators[T];
  target: FilterOperatorTarget;
  singularOf?: FilterOperators[T];
  pluralOf?: FilterOperators[T];
  isNegated: boolean;
  negation?: FilterOperators[T];
  negationOf?: FilterOperators[T];
};

export type FilterOperatorMap<T extends FilterType> = Record<string, FilterOperatorDetails<T>>;

export type FilterModel<T extends FilterType = FilterType> = {
  columnId: string;
  type: T;
  operator: string;
  values: string[];
};

export type FiltersState = FilterModel[];

// ── Operator Configs ───────────────────────────────────────────────────

export const textFilterOperators: FilterOperatorMap<'text'> = {
  contains: {
    value: 'contains',
    target: 'single',
    isNegated: false,
    negation: 'does not contain',
  },
  'does not contain': {
    value: 'does not contain',
    target: 'single',
    isNegated: true,
    negationOf: 'contains',
  },
};

export const optionFilterOperators: FilterOperatorMap<'option'> = {
  is: {
    value: 'is',
    target: 'single',
    singularOf: 'is any of',
    isNegated: false,
    negation: 'is not',
  },
  'is not': {
    value: 'is not',
    target: 'single',
    singularOf: 'is none of',
    isNegated: true,
    negationOf: 'is',
  },
  'is any of': {
    value: 'is any of',
    target: 'multiple',
    pluralOf: 'is',
    isNegated: false,
    negation: 'is none of',
  },
  'is none of': {
    value: 'is none of',
    target: 'multiple',
    pluralOf: 'is not',
    isNegated: true,
    negationOf: 'is any of',
  },
};

export const multiOptionFilterOperators: FilterOperatorMap<'multiOption'> = {
  include: {
    value: 'include',
    target: 'single',
    singularOf: 'include any of',
    isNegated: false,
    negation: 'exclude',
  },
  exclude: {
    value: 'exclude',
    target: 'single',
    singularOf: 'include all of',
    isNegated: true,
    negationOf: 'include',
  },
  'include any of': {
    value: 'include any of',
    target: 'multiple',
    pluralOf: 'include',
    isNegated: false,
    negation: 'include all of',
  },
  'include all of': {
    value: 'include all of',
    target: 'multiple',
    pluralOf: 'include',
    isNegated: false,
    negation: 'exclude',
  },
};

export const filterTypeOperatorDetails: Record<FilterType, FilterOperatorMap<FilterType>> = {
  text: textFilterOperators,
  option: optionFilterOperators,
  multiOption: multiOptionFilterOperators,
};

// ── Default Operators ──────────────────────────────────────────────────

const DEFAULT_OPERATORS: Record<FilterType, Record<FilterOperatorTarget, string>> = {
  text: { single: 'contains', multiple: 'contains' },
  option: { single: 'is', multiple: 'is any of' },
  multiOption: { single: 'include', multiple: 'include any of' },
};

export function getDefaultOperator(type: FilterType, target: FilterOperatorTarget = 'single'): string {
  return DEFAULT_OPERATORS[type][target];
}

export function getOperatorsForType(type: FilterType): FilterOperatorMap<FilterType> {
  return filterTypeOperatorDetails[type];
}

// ── Operator Auto-Transition ───────────────────────────────────────────

export function determineNewOperator(
  type: FilterType,
  oldValues: string[],
  nextValues: string[],
  currentOperator: string,
): string {
  const a = oldValues.length;
  const b = nextValues.length;

  if (a === b || (a >= 2 && b >= 2) || (a <= 1 && b <= 1)) {
    return currentOperator;
  }

  const opDetails = filterTypeOperatorDetails[type][currentOperator];
  if (!opDetails) return currentOperator;

  // Single → multiple
  if (a < b && b >= 2) return (opDetails.singularOf as string) ?? currentOperator;
  // Multiple → single
  if (a > b && b <= 1) return (opDetails.pluralOf as string) ?? currentOperator;

  return currentOperator;
}

// ── Filter Predicate Functions (for TanStack Table filterFn) ───────────

export function optionFilterFn(rowValue: string, filterModel: FilterModel<'option'>): boolean {
  if (!rowValue) return false;
  if (filterModel.values.length === 0) return true;

  const value = rowValue.toString().toLowerCase();
  const found = filterModel.values.some((v) => v.toLowerCase() === value);

  switch (filterModel.operator) {
    case 'is':
    case 'is any of':
      return found;
    case 'is not':
    case 'is none of':
      return !found;
    default:
      return true;
  }
}

export function multiOptionFilterFn(rowValue: string[], filterModel: FilterModel<'multiOption'>): boolean {
  if (!rowValue) return false;
  if (filterModel.values.length === 0) return true;

  const intersection = rowValue.filter((v) => filterModel.values.some((fv) => fv.toLowerCase() === v.toLowerCase()));

  switch (filterModel.operator) {
    case 'include':
    case 'include any of':
      return intersection.length > 0;
    case 'exclude':
      return intersection.length === 0;
    case 'include all of':
      return intersection.length === filterModel.values.length;
    default:
      return true;
  }
}

export function textFilterFn(rowValue: string, filterModel: FilterModel<'text'>): boolean {
  if (!filterModel.values.length) return true;

  const value = rowValue?.toLowerCase().trim() ?? '';
  const filterStr = filterModel.values[0].toLowerCase().trim();

  if (filterStr === '') return true;

  const found = value.includes(filterStr);

  switch (filterModel.operator) {
    case 'contains':
      return found;
    case 'does not contain':
      return !found;
    default:
      return true;
  }
}

export function createFilterFn(type: FilterType) {
  return (row: { getValue: (id: string) => unknown }, columnId: string, filterModel: FilterModel) => {
    if (!filterModel || filterModel.values.length === 0) return true;

    const value = row.getValue(columnId);

    switch (type) {
      case 'option':
        return optionFilterFn(value as string, filterModel as FilterModel<'option'>);
      case 'multiOption':
        return multiOptionFilterFn(value as string[], filterModel as FilterModel<'multiOption'>);
      case 'text':
        return textFilterFn(value as string, filterModel as FilterModel<'text'>);
      default:
        return true;
    }
  };
}

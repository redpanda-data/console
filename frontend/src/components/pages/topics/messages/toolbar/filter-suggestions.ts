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

import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { FilterOp } from '../types';
import { distinctFieldValues, matchesFieldFilter, valuePaths } from '../utils/client-match';
import { looksLikeJs, looksLikeJsCode, NUMERIC_FIELDS, parseFilterInput, stripJsPrefix } from '../utils/filter-token';

/**
 * Actions interpreted by the filter bar. A `fill-text` action with `commit`
 * confirms the search and closes the picker; other fills leave it open.
 */
export type SuggestionAction =
  | { type: 'set-pending'; field: string }
  | { type: 'commit-field'; field: string; op: FilterOp; value: string }
  | { type: 'fill-text'; text: string; commit?: boolean }
  | { type: 'open-js'; code?: string; name?: string };

export type SuggestionItem =
  | { kind: 'header'; label: string }
  | { kind: 'item'; label: string; sub?: string; action: SuggestionAction };

export type RecentSearch = { label: string; action: SuggestionAction };

export type SuggestionsInput = {
  query: string;
  pendingField: string | null;
  messages: TopicMessage[];
  recents: RecentSearch[];
  canUseJsFilters: boolean;
};

const msgs = (n: number) => (n === 1 ? '1 msg' : `${n} msgs`);

const OFFSET_COMPARISON_PATTERN = /^offset[:><=](?<offset>\d+)$/u;
const NESTED_VALUE_PATTERN = /^value[.:](?<path>[\w.-]*)$/u;
const EMPTY_VALUE_FIELD_PATTERN = /^(?<field>partition|key|offset|value\.[\w.*-]+):$/u;

const countMatches = (messages: TopicMessage[], field: string, op: FilterOp, value: string) =>
  messages.filter((m) => matchesFieldFilter(m, field, op, value)).length;

const OFFSET_COMPARISON_OPS = [
  ['gt', '>'],
  ['lt', '<'],
  ['eq', '='],
] as const;

const offsetComparisonItems = (messages: TopicMessage[], value: string) =>
  OFFSET_COMPARISON_OPS.map<SuggestionItem>(([op, symbol]) => ({
    kind: 'item',
    label: `offset ${symbol} ${value}`,
    sub: msgs(countMatches(messages, 'offset', op, value)),
    action: { type: 'commit-field', field: 'offset', op, value },
  }));

const fieldValueItems = (messages: TopicMessage[], field: string, query: string) => {
  const items = distinctFieldValues(messages, field, query).map<SuggestionItem>(({ value, count }) => ({
    kind: 'item',
    label: value,
    sub: msgs(count),
    action: { type: 'commit-field', field, op: NUMERIC_FIELDS.has(field) ? 'eq' : 'contains', value },
  }));
  if (query && !NUMERIC_FIELDS.has(field)) {
    items.push({
      kind: 'item',
      label: `${field} contains "${query}"`,
      sub: msgs(countMatches(messages, field, 'contains', query)),
      action: { type: 'commit-field', field, op: 'contains', value: query },
    });
  }
  return items;
};

const pendingValueItems = ({ query, pendingField, messages }: SuggestionsInput) => {
  const field = pendingField as string;
  return field === 'offset' && query ? offsetComparisonItems(messages, query) : fieldValueItems(messages, field, query);
};

const nestedValueItems = (input: SuggestionsInput) => {
  const match = NESTED_VALUE_PATTERN.exec(input.query.trim());
  if (!match?.groups) {
    return null;
  }
  const paths = valuePaths(input.messages, match.groups.path);
  if (paths.length === 0) {
    return null;
  }
  return [
    { kind: 'header', label: 'Fields under value' },
    ...paths.slice(0, 6).map<SuggestionItem>((path) => ({
      kind: 'item',
      label: `value.${path}`,
      sub: 'field',
      action: { type: 'set-pending', field: `value.${path}` },
    })),
  ] satisfies SuggestionItem[];
};

const typedTokenItems = (input: SuggestionsInput) => {
  const parsed = parseFilterInput(input.query);
  if (!parsed) {
    return null;
  }
  return [
    { kind: 'header', label: 'Field filter' },
    {
      kind: 'item',
      label: input.query.trim(),
      sub: msgs(countMatches(input.messages, parsed.field, parsed.op, parsed.value)),
      action: { type: 'commit-field', ...parsed },
    },
  ] satisfies SuggestionItem[];
};

const recentItems = (recents: RecentSearch[]) =>
  recents.length === 0
    ? []
    : ([
        { kind: 'header', label: 'Recent searches' },
        ...recents
          .slice(0, 3)
          .map<SuggestionItem>((recent) => ({ kind: 'item', label: recent.label, action: recent.action })),
      ] satisfies SuggestionItem[]);

const jsEditorItems = (query: string) =>
  [
    { kind: 'header', label: 'JavaScript' },
    {
      kind: 'item',
      label: `ƒ ${stripJsPrefix(query)}`,
      sub: 'open editor',
      action: { type: 'open-js', code: stripJsPrefix(query) },
    },
  ] satisfies SuggestionItem[];

const fullTextItems = (query: string, messages: TopicMessage[], canUseJsFilters: boolean) => {
  const fullTextCount = messages.filter(
    (m) =>
      String(m.offset).includes(query.toLowerCase()) ||
      m.keyJson?.toLowerCase().includes(query.toLowerCase()) ||
      m.valueJson?.toLowerCase().includes(query.toLowerCase())
  ).length;
  const items: SuggestionItem[] = [
    { kind: 'header', label: 'Full text' },
    {
      kind: 'item',
      label: `Search "${query}"`,
      sub: msgs(fullTextCount),
      action: { type: 'fill-text', text: query, commit: true },
    },
  ];
  return canUseJsFilters && looksLikeJs(query) ? [...jsEditorItems(query), ...items] : items;
};

const filterItems = (canUseJsFilters: boolean) =>
  [
    { kind: 'header', label: 'Filters' },
    {
      kind: 'item',
      label: 'partition:',
      sub: 'filter by partition',
      action: { type: 'set-pending', field: 'partition' },
    },
    ...(canUseJsFilters
      ? [
          {
            kind: 'item',
            label: 'js:',
            sub: 'JavaScript predicate',
            action: { type: 'open-js' },
          } satisfies SuggestionItem,
        ]
      : []),
  ] satisfies SuggestionItem[];

const fieldItems = () =>
  [
    { kind: 'header', label: 'Fields' },
    {
      kind: 'item',
      label: 'value:',
      sub: 'search entire value',
      action: { type: 'fill-text', text: 'value:' },
    },
    { kind: 'item', label: 'key:', sub: 'search keys', action: { type: 'set-pending', field: 'key' } },
    {
      kind: 'item',
      label: 'offset:',
      sub: 'compare offsets',
      action: { type: 'set-pending', field: 'offset' },
    },
  ] satisfies SuggestionItem[];

const defaultGroupItems = ({ query, recents, canUseJsFilters, messages }: SuggestionsInput) =>
  [
    ...(query ? fullTextItems(query, messages, canUseJsFilters) : recentItems(recents)),
    ...filterItems(canUseJsFilters),
    ...fieldItems(),
  ] satisfies SuggestionItem[];

type Suggestions = { heading: string; items: SuggestionItem[] };

const explicitJsPrefixItems = (input: SuggestionsInput) => {
  if (!(input.canUseJsFilters && (input.query.startsWith('js:') || input.query.startsWith('javascript:')))) {
    return null;
  }
  const stripped = stripJsPrefix(input.query);
  const isCode = looksLikeJsCode(stripped);
  return {
    heading: 'JavaScript',
    items: [
      {
        kind: 'item',
        label: `ƒ ${stripped || 'new filter'}`,
        sub: isCode ? 'open editor' : 'open editor, named',
        action: isCode ? { type: 'open-js', code: stripped } : { type: 'open-js', name: stripped },
      },
    ],
  } satisfies Suggestions;
};

const pendingFieldSuggestions = (input: SuggestionsInput) => {
  if (!input.pendingField) {
    return null;
  }
  const label = input.pendingField === 'partition' ? 'Partition' : input.pendingField;
  return { heading: `Value for ${label}`, items: pendingValueItems(input) } satisfies Suggestions;
};

const nestedValueSuggestions = (input: SuggestionsInput) => {
  const nested = nestedValueItems(input);
  return nested ? ({ heading: 'Suggestions', items: nested } satisfies Suggestions) : null;
};

const emptyValueFieldSuggestions = (input: SuggestionsInput) => {
  const emptyValueField = EMPTY_VALUE_FIELD_PATTERN.exec(input.query.trim());
  if (!emptyValueField) {
    return null;
  }
  const [, field] = emptyValueField;
  return {
    heading: `Value for ${field === 'partition' ? 'Partition' : field}`,
    items: pendingValueItems({ ...input, pendingField: field, query: '' }),
  } satisfies Suggestions;
};

const offsetComparisonSuggestions = (input: SuggestionsInput) => {
  const offsetComparison = OFFSET_COMPARISON_PATTERN.exec(input.query.trim());
  if (!offsetComparison) {
    return null;
  }
  return {
    heading: 'Compare offset',
    items: pendingValueItems({ ...input, pendingField: 'offset', query: offsetComparison[1] }),
  } satisfies Suggestions;
};

const typedTokenSuggestions = (input: SuggestionsInput) => {
  const typed = typedTokenItems(input);
  return typed ? ({ heading: 'Suggestions', items: typed } satisfies Suggestions) : null;
};

const SUGGESTION_RESOLVERS: ((input: SuggestionsInput) => Suggestions | null)[] = [
  pendingFieldSuggestions,
  nestedValueSuggestions,
  emptyValueFieldSuggestions,
  offsetComparisonSuggestions,
  explicitJsPrefixItems,
  typedTokenSuggestions,
];

/**
 * Heading + item list for the autocomplete dropdown, given the current input state.
 *
 * A completed offset offers all three comparisons with match counts. Bare text fields offer loaded values; bare value: instead searches the whole payload. Nested value paths can enumerate loaded values. The explicit JavaScript prefix opens the editor, with either code or a proposed filter name.
 */
export function buildSuggestions(input: SuggestionsInput) {
  for (const resolve of SUGGESTION_RESOLVERS) {
    const suggestions = resolve(input);
    if (suggestions) {
      return suggestions;
    }
  }
  const fallback: Suggestions = { heading: 'Suggestions', items: defaultGroupItems(input) };
  return fallback;
}

type Ghost = { rest: string; action: SuggestionAction };

const pendingValueGhost = (messages: TopicMessage[], pendingField: string, query: string) => {
  const [first] = distinctFieldValues(messages, pendingField, '', 100).filter(({ value }) =>
    value.toLowerCase().startsWith(query.toLowerCase())
  );
  if (first && first.value.length > query.length) {
    const completion: Ghost = {
      rest: first.value.slice(query.length),
      action: {
        type: 'commit-field',
        field: pendingField,
        op: pendingField === 'partition' ? 'eq' : 'contains',
        value: first.value,
      },
    };
    return completion;
  }
  return null;
};

const fieldNameGhost = (query: string) => {
  for (const field of ['partition', 'offset', 'key', 'value']) {
    if (field.startsWith(query.toLowerCase()) && field !== query.toLowerCase()) {
      const completion: Ghost = { rest: `${field.slice(query.length)}:`, action: { type: 'set-pending', field } };
      return completion;
    }
  }
  return null;
};

/**
 * Inline ghost completion: when the typed text is a prefix of a suggestable
 * field name or pending value, returns the remainder plus the action Tab accepts.
 */
export function computeGhost(input: SuggestionsInput) {
  const { query } = input;
  if (!query) {
    return null;
  }
  return input.pendingField ? pendingValueGhost(input.messages, input.pendingField, query) : fieldNameGhost(query);
}

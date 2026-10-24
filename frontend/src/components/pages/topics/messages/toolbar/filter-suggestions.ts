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

/** What selecting a suggestion does; interpreted by the filter bar. */
export type SuggestionAction =
  | { type: 'set-pending'; field: string }
  | { type: 'commit-field'; field: string; op: FilterOp; value: string }
  // `commit` marks a fill that confirms the search as-is (Enter on `Search "…"`), which closes
  // the popup — as opposed to fills like `value:` that the user keeps typing into.
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

/** A completed `offset:N`/`offset>N`/`offset<N`/`offset=N` word — matched so the dropdown can
 * offer all three comparison alternatives (with match counts) instead of silently committing to
 * whichever operator happened to be typed. */
const OFFSET_COMPARISON_PATTERN = /^offset[:><=](\d+)$/;
const NESTED_VALUE_PATTERN = /^value[.:](?<path>[\w.-]*)$/;
const EMPTY_VALUE_FIELD_PATTERN = /^(partition|key|offset|value\.[\w.*-]+):$/;

const countMatches = (messages: TopicMessage[], field: string, op: FilterOp, value: string) =>
  messages.filter((m) => matchesFieldFilter(m, field, op, value)).length;

const OFFSET_COMPARISON_OPS = [
  ['gt', '>'],
  ['lt', '<'],
  ['eq', '='],
] as const;

/** `offset > N` / `offset < N` / `offset = N`, each with its match count. */
const offsetComparisonItems = (messages: TopicMessage[], value: string): SuggestionItem[] =>
  OFFSET_COMPARISON_OPS.map(
    ([op, symbol]): SuggestionItem => ({
      kind: 'item',
      label: `offset ${symbol} ${value}`,
      sub: msgs(countMatches(messages, 'offset', op, value)),
      action: { type: 'commit-field', field: 'offset', op, value },
    })
  );

/** The field's distinct loaded values, plus a free-text `contains` option for non-numeric fields. */
const fieldValueItems = (messages: TopicMessage[], field: string, query: string): SuggestionItem[] => {
  const items = distinctFieldValues(messages, field, query).map(
    ({ value, count }): SuggestionItem => ({
      kind: 'item',
      label: value,
      sub: msgs(count),
      action: { type: 'commit-field', field, op: NUMERIC_FIELDS.has(field) ? 'eq' : 'contains', value },
    })
  );
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

const pendingValueItems = ({ query, pendingField, messages }: SuggestionsInput): SuggestionItem[] => {
  const field = pendingField as string;
  return field === 'offset' && query ? offsetComparisonItems(messages, query) : fieldValueItems(messages, field, query);
};

/** `value:` / `value.<path>` traversal: suggest nested paths, then values at a leaf. */
const nestedValueItems = (input: SuggestionsInput): SuggestionItem[] | null => {
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
    ...paths.slice(0, 6).map(
      (path): SuggestionItem => ({
        kind: 'item',
        label: `value.${path}`,
        sub: 'field',
        action: { type: 'set-pending', field: `value.${path}` },
      })
    ),
  ];
};

const typedTokenItems = (input: SuggestionsInput): SuggestionItem[] | null => {
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
  ];
};

const recentItems = (recents: RecentSearch[]): SuggestionItem[] =>
  recents.length === 0
    ? []
    : [
        { kind: 'header', label: 'Recent searches' },
        ...recents
          .slice(0, 3)
          .map((recent): SuggestionItem => ({ kind: 'item', label: recent.label, action: recent.action })),
      ];

/** Offers the typed text as JavaScript when it reads like a predicate. */
const jsEditorItems = (query: string): SuggestionItem[] => [
  { kind: 'header', label: 'JavaScript' },
  {
    kind: 'item',
    label: `ƒ ${stripJsPrefix(query)}`,
    sub: 'open editor',
    action: { type: 'open-js', code: stripJsPrefix(query) },
  },
];

const fullTextItems = (query: string, messages: TopicMessage[], canUseJsFilters: boolean): SuggestionItem[] => {
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

const filterItems = (canUseJsFilters: boolean): SuggestionItem[] => [
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
];

const fieldItems = (): SuggestionItem[] => [
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
];

/** With text typed, full-text (and maybe JavaScript) options lead; otherwise recent searches do. */
const defaultGroupItems = ({ query, recents, canUseJsFilters, messages }: SuggestionsInput): SuggestionItem[] => [
  ...(query ? fullTextItems(query, messages, canUseJsFilters) : recentItems(recents)),
  ...filterItems(canUseJsFilters),
  ...fieldItems(),
];

type Suggestions = { heading: string; items: SuggestionItem[] };

/** An explicit `js:`/`javascript:` prefix routes straight to the editor — as code if the rest reads like an expression, otherwise as the new filter's name. */
const explicitJsPrefixItems = (input: SuggestionsInput): Suggestions | null => {
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
  };
};

const pendingFieldSuggestions = (input: SuggestionsInput): Suggestions | null => {
  if (!input.pendingField) {
    return null;
  }
  const label = input.pendingField === 'partition' ? 'Partition' : input.pendingField;
  return { heading: `Value for ${label}`, items: pendingValueItems(input) };
};

const nestedValueSuggestions = (input: SuggestionsInput): Suggestions | null => {
  const nested = nestedValueItems(input);
  return nested ? { heading: 'Suggestions', items: nested } : null;
};

/**
 * A bare `field:` with no value yet behaves like picking the field from the list: show the
 * possible values right away. Nested `value.<path>:` counts too (bare `value:` is intentionally
 * excluded — it's a free-text substring search over the whole value, not an enumerable field).
 */
const emptyValueFieldSuggestions = (input: SuggestionsInput): Suggestions | null => {
  const emptyValueField = EMPTY_VALUE_FIELD_PATTERN.exec(input.query.trim());
  if (!emptyValueField) {
    return null;
  }
  const [, field] = emptyValueField;
  return {
    heading: `Value for ${field === 'partition' ? 'Partition' : field}`,
    items: pendingValueItems({ ...input, pendingField: field, query: '' }),
  };
};

const offsetComparisonSuggestions = (input: SuggestionsInput): Suggestions | null => {
  const offsetComparison = OFFSET_COMPARISON_PATTERN.exec(input.query.trim());
  if (!offsetComparison) {
    return null;
  }
  return {
    heading: 'Compare offset',
    items: pendingValueItems({ ...input, pendingField: 'offset', query: offsetComparison[1] }),
  };
};

const typedTokenSuggestions = (input: SuggestionsInput): Suggestions | null => {
  const typed = typedTokenItems(input);
  return typed ? { heading: 'Suggestions', items: typed } : null;
};

/** Tried in order; the first that applies decides the dropdown, else the default groups show. */
const SUGGESTION_RESOLVERS: ((input: SuggestionsInput) => Suggestions | null)[] = [
  pendingFieldSuggestions,
  nestedValueSuggestions,
  emptyValueFieldSuggestions,
  offsetComparisonSuggestions,
  explicitJsPrefixItems,
  typedTokenSuggestions,
];

/** Heading + item list for the autocomplete dropdown, given the current input state. */
export function buildSuggestions(input: SuggestionsInput): Suggestions {
  for (const resolve of SUGGESTION_RESOLVERS) {
    const suggestions = resolve(input);
    if (suggestions) {
      return suggestions;
    }
  }
  return { heading: 'Suggestions', items: defaultGroupItems(input) };
}

type Ghost = { rest: string; action: SuggestionAction };

/** Completes a pending field's value toward its most common loaded match. */
const pendingValueGhost = (messages: TopicMessage[], pendingField: string, query: string): Ghost | null => {
  const [first] = distinctFieldValues(messages, pendingField, '', 100).filter(({ value }) =>
    value.toLowerCase().startsWith(query.toLowerCase())
  );
  if (first && first.value.length > query.length) {
    return {
      rest: first.value.slice(query.length),
      action: {
        type: 'commit-field',
        field: pendingField,
        op: pendingField === 'partition' ? 'eq' : 'contains',
        value: first.value,
      },
    };
  }
  return null;
};

/** Completes a field name with its trailing colon. */
const fieldNameGhost = (query: string): Ghost | null => {
  for (const field of ['partition', 'offset', 'key', 'value']) {
    if (field.startsWith(query.toLowerCase()) && field !== query.toLowerCase()) {
      return { rest: `${field.slice(query.length)}:`, action: { type: 'set-pending', field } };
    }
  }
  return null;
};

/**
 * Inline ghost completion: when the typed text is a prefix of a suggestable
 * field name or pending value, returns the remainder plus the action Tab accepts.
 */
export function computeGhost(input: SuggestionsInput): Ghost | null {
  const { query } = input;
  if (!query) {
    return null;
  }
  return input.pendingField ? pendingValueGhost(input.messages, input.pendingField, query) : fieldNameGhost(query);
}

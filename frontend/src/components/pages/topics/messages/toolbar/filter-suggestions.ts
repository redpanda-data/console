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
import { looksLikeJs, looksLikeJsCode, parseFilterInput, stripJsPrefix } from '../utils/filter-token';

/** What selecting a suggestion does; interpreted by the filter bar. */
export type SuggestionAction =
  | { type: 'set-pending'; field: string }
  | { type: 'commit-field'; field: string; op: FilterOp; value: string }
  | { type: 'fill-text'; text: string }
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

const countMatches = (messages: TopicMessage[], field: string, op: FilterOp, value: string) =>
  messages.filter((m) => matchesFieldFilter(m, field, op, value)).length;

const pendingValueItems = ({ query, pendingField, messages }: SuggestionsInput): SuggestionItem[] => {
  const field = pendingField as string;
  const items: SuggestionItem[] = [];

  if (field === 'offset' && query) {
    for (const op of ['gt', 'lt', 'eq'] as const) {
      const symbol = { gt: '>', lt: '<', eq: '=' }[op];
      items.push({
        kind: 'item',
        label: `offset ${symbol} ${query}`,
        sub: msgs(countMatches(messages, 'offset', op, query)),
        action: { type: 'commit-field', field, op, value: query },
      });
    }
    return items;
  }

  for (const { value, count } of distinctFieldValues(messages, field, query)) {
    items.push({
      kind: 'item',
      label: value,
      sub: msgs(count),
      action: { type: 'commit-field', field, op: field === 'partition' ? 'eq' : 'contains', value },
    });
  }
  if (query && field !== 'partition') {
    items.push({
      kind: 'item',
      label: `${field} contains "${query}"`,
      sub: msgs(countMatches(messages, field, 'contains', query)),
      action: { type: 'commit-field', field, op: 'contains', value: query },
    });
  }
  return items;
};

/** `value:` / `value.<path>` traversal: suggest nested paths, then values at a leaf. */
const nestedValueItems = (input: SuggestionsInput): SuggestionItem[] | null => {
  const match = /^value[.:](?<path>[\w.-]*)$/.exec(input.query.trim());
  if (!match?.groups) {
    return null;
  }
  const typedPath = match.groups.path;
  const paths = valuePaths(input.messages, typedPath);
  if (paths.length === 0) {
    return null;
  }
  const items: SuggestionItem[] = [{ kind: 'header', label: 'Fields under value' }];
  for (const path of paths.slice(0, 6)) {
    items.push({
      kind: 'item',
      label: `value.${path}`,
      sub: 'field',
      action: { type: 'set-pending', field: `value.${path}` },
    });
  }
  return items;
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

const defaultGroupItems = ({ query, recents, canUseJsFilters, messages }: SuggestionsInput): SuggestionItem[] => {
  const items: SuggestionItem[] = [];

  if (!query && recents.length > 0) {
    items.push({ kind: 'header', label: 'Recent searches' });
    for (const recent of recents.slice(0, 3)) {
      items.push({ kind: 'item', label: recent.label, action: recent.action });
    }
  }

  items.push({ kind: 'header', label: 'Filters' });
  items.push({
    kind: 'item',
    label: 'partition:',
    sub: 'filter by partition',
    action: { type: 'set-pending', field: 'partition' },
  });
  if (canUseJsFilters) {
    items.push({
      kind: 'item',
      label: 'js:',
      sub: 'JavaScript predicate',
      action: { type: 'open-js' },
    });
  }

  items.push({ kind: 'header', label: 'Fields' });
  items.push({
    kind: 'item',
    label: 'value:',
    sub: 'search entire value',
    action: { type: 'fill-text', text: 'value:' },
  });
  items.push({ kind: 'item', label: 'key:', sub: 'search keys', action: { type: 'set-pending', field: 'key' } });
  items.push({
    kind: 'item',
    label: 'offset:',
    sub: 'compare offsets',
    action: { type: 'set-pending', field: 'offset' },
  });

  if (query) {
    const fullTextCount = messages.filter(
      (m) =>
        String(m.offset).includes(query.toLowerCase()) ||
        m.keyJson?.toLowerCase().includes(query.toLowerCase()) ||
        m.valueJson?.toLowerCase().includes(query.toLowerCase())
    ).length;
    items.unshift(
      { kind: 'header', label: 'Full text' },
      {
        kind: 'item',
        label: `Search "${query}"`,
        sub: msgs(fullTextCount),
        action: { type: 'fill-text', text: query },
      }
    );
    if (canUseJsFilters && looksLikeJs(query)) {
      items.unshift(
        { kind: 'header', label: 'JavaScript' },
        {
          kind: 'item',
          label: `ƒ ${stripJsPrefix(query)}`,
          sub: 'open editor',
          action: { type: 'open-js', code: stripJsPrefix(query) },
        }
      );
    }
  }

  return items;
};

/** An explicit `js:`/`javascript:` prefix routes straight to the editor — as code if the rest reads like an expression, otherwise as the new filter's name. */
const explicitJsPrefixItems = (input: SuggestionsInput): { heading: string; items: SuggestionItem[] } | null => {
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

/** Heading + item list for the autocomplete dropdown, given the current input state. */
export function buildSuggestions(input: SuggestionsInput): { heading: string; items: SuggestionItem[] } {
  if (input.pendingField) {
    const label = input.pendingField === 'partition' ? 'Partition' : input.pendingField;
    return { heading: `Value for ${label}`, items: pendingValueItems(input) };
  }

  const nested = nestedValueItems(input);
  if (nested) {
    return { heading: 'Suggestions', items: nested };
  }

  // A bare `field:` with no value yet behaves like picking the field from the
  // list: show the possible values right away. Nested `value.<path>:` counts
  // too (bare `value:` is intentionally excluded — it's a free-text substring
  // search over the whole value, not an enumerable field).
  const emptyValueField = /^(partition|key|offset|value\.[\w.*-]+):$/.exec(input.query.trim());
  if (emptyValueField) {
    const field = emptyValueField[1];
    return {
      heading: `Value for ${field === 'partition' ? 'Partition' : field}`,
      items: pendingValueItems({ ...input, pendingField: field, query: '' }),
    };
  }

  const explicitJs = explicitJsPrefixItems(input);
  if (explicitJs) {
    return explicitJs;
  }

  const typed = typedTokenItems(input);
  if (typed) {
    return { heading: 'Suggestions', items: typed };
  }

  return { heading: 'Suggestions', items: defaultGroupItems(input) };
}

/**
 * Inline ghost completion: when the typed text is a prefix of a suggestable
 * field name or pending value, returns the remainder plus the action Tab accepts.
 */
export function computeGhost(input: SuggestionsInput): { rest: string; action: SuggestionAction } | null {
  const query = input.query;
  if (!query) {
    return null;
  }

  if (input.pendingField) {
    const [first] = distinctFieldValues(input.messages, input.pendingField, '', 100).filter(({ value }) =>
      value.toLowerCase().startsWith(query.toLowerCase())
    );
    if (first && first.value.length > query.length) {
      return {
        rest: first.value.slice(query.length),
        action: {
          type: 'commit-field',
          field: input.pendingField,
          op: input.pendingField === 'partition' ? 'eq' : 'contains',
          value: first.value,
        },
      };
    }
    return null;
  }

  for (const field of ['partition', 'offset', 'key', 'value']) {
    if (field.startsWith(query.toLowerCase()) && field !== query.toLowerCase()) {
      return { rest: `${field.slice(query.length)}:`, action: { type: 'set-pending', field } };
    }
  }
  return null;
}

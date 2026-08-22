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

import { useMemo } from 'react';

import type { TopicMessage } from '../../../../../state/rest-interfaces';
import type { FilterToken } from '../types';
import { matchesFieldFilter } from '../utils/client-match';
import { parseFilterInput } from '../utils/filter-token';

/**
 * Live full-text filtering over the loaded rows (offset, key and value JSON),
 * mirroring the legacy quick search. When the typed text parses as a
 * `field op value` token it is applied as a field filter instead.
 */
export function matchesQuickSearch(msg: TopicMessage, query: string, partitionCount?: number): boolean {
  const parsed = parseFilterInput(query, { partitionCount });
  if (parsed) {
    return matchesFieldFilter(msg, parsed.field, parsed.op, parsed.value);
  }
  const needle = query.toLowerCase();
  return (
    String(msg.offset).includes(needle) ||
    msg.keyJson?.toLowerCase().includes(needle) ||
    msg.valueJson?.toLowerCase().includes(needle)
  );
}

/**
 * Client-side filtering: every committed field token must match (AND), then the
 * live typed text. JS filters are pushed down to the backend and don't run here.
 */
export function useClientFilters(
  messages: TopicMessage[],
  quickSearch: string,
  fieldTokens: FilterToken[] = [],
  partitionCount?: number
): TopicMessage[] {
  return useMemo(() => {
    const query = quickSearch.trim();
    const tokens = fieldTokens.filter((t) => t.kind === 'field');
    if (!(query || tokens.length > 0)) {
      return messages;
    }
    return messages.filter(
      (msg) =>
        tokens.every((t) => matchesFieldFilter(msg, t.field, t.op, t.value)) &&
        (!query || matchesQuickSearch(msg, query, partitionCount))
    );
  }, [messages, quickSearch, fieldTokens, partitionCount]);
}

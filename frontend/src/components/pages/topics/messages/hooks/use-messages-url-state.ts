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

import type { SortingState } from '@tanstack/react-table';
import { createParser, parseAsBoolean, parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect } from 'react';

import { useQueryStateWithCallback } from '../../../../../hooks/use-query-state-with-callback';
import { PayloadEncoding } from '../../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { PartitionOffsetOrigin } from '../../../../../state/ui';
import { DEFAULT_SORTING, useTopicSettingsStore } from '../../../../../stores/topic-settings-store';
import { sortingParser } from '../../../../../utils/sorting-parser';
import type { FieldFilterToken, ReadScopeMode } from '../types';
import { parseFilterInput, sameFieldTokens, tokenQueryText } from '../utils/filter-token';

const DEFAULT_MAX_RESULTS = 50;

// Comma-separated `field op value` texts (`key:abc,offset>5`). Commas inside
// values are escaped so splitting stays unambiguous. JS filters are
// intentionally NOT persisted in the URL — code doesn't belong in share links.
const escapeToken = (text: string) => text.replace(/%/g, '%25').replace(/,/g, '%2C');
const unescapeToken = (text: string) => text.replace(/%2C/g, ',').replace(/%25/g, '%');

export const fieldTokensParser = createParser<FieldFilterToken[]>({
  parse: (value) => {
    const tokens: FieldFilterToken[] = [];
    for (const part of value.split(',')) {
      const parsed = parseFilterInput(unescapeToken(part));
      if (parsed) {
        tokens.push({ kind: 'field', ...parsed });
      }
    }
    return tokens;
  },
  serialize: (tokens) => tokens.map((t) => escapeToken(tokenQueryText(t))).join(','),
  eq: sameFieldTokens,
});

/** Maps the persisted/URL start offset sentinel to the read-scope mode shown in the toolbar. */
export function readScopeModeFromOffset(startOffset: number): ReadScopeMode {
  switch (startOffset) {
    case PartitionOffsetOrigin.Start:
      return 'oldest';
    case PartitionOffsetOrigin.Timestamp:
      return 'timestamp';
    case PartitionOffsetOrigin.EndMinusResults:
      return 'newest';
    default:
      return startOffset >= 0 ? 'offset' : 'newest';
  }
}

export function offsetForReadScopeMode(mode: ReadScopeMode, customOffset: number): number {
  switch (mode) {
    case 'oldest':
      return PartitionOffsetOrigin.Start;
    case 'timestamp':
      return PartitionOffsetOrigin.Timestamp;
    case 'offset':
      return Math.max(0, customOffset);
    default:
      return PartitionOffsetOrigin.EndMinusResults;
  }
}

/**
 * URL-backed search state for the messages page (same query keys as the legacy
 * viewer so shared links keep working), mirrored into the per-topic Zustand store.
 *
 * `live` is new: live tail is orthogonal to the read scope. Legacy URLs with
 * `o=-3` (PartitionOffsetOrigin.End) are migrated to `live=true` + newest scope.
 */
export function useMessagesUrlState(topicName: string) {
  const { setSearchParams, getSearchParams, setSorting, getSorting } = useTopicSettingsStore();

  const [partitionId, setPartitionId] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => setSearchParams(topicName, { partitionID: val }),
      getDefaultValue: () => getSearchParams(topicName)?.partitionID ?? -1,
    },
    'p',
    parseAsInteger.withDefault(-1)
  );

  const [maxResults, setMaxResults] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => setSearchParams(topicName, { maxResults: val }),
      getDefaultValue: () => getSearchParams(topicName)?.maxResults ?? DEFAULT_MAX_RESULTS,
    },
    's',
    parseAsInteger.withDefault(DEFAULT_MAX_RESULTS)
  );

  const [startOffset, setStartOffset] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => setSearchParams(topicName, { startOffset: val }),
      getDefaultValue: () => {
        const stored = getSearchParams(topicName)?.startOffset ?? PartitionOffsetOrigin.EndMinusResults;
        // Live tail is no longer a start-offset mode; stored End means "was live"
        return stored === PartitionOffsetOrigin.End ? PartitionOffsetOrigin.EndMinusResults : stored;
      },
    },
    'o',
    parseAsInteger.withDefault(PartitionOffsetOrigin.EndMinusResults)
  );

  const [startTimestamp, setStartTimestamp] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => setSearchParams(topicName, { startTimestamp: val, startTimestampWasSetByUser: true }),
      getDefaultValue: () => getSearchParams(topicName)?.startTimestamp ?? -1,
    },
    't',
    parseAsInteger.withDefault(-1)
  );

  const [quickSearch, setQuickSearch] = useQueryState('q', parseAsString.withDefault(''));

  // Committed filter chips (`key:abc`, `offset>5`, …). JS filter chips are excluded.
  const [fieldTokens, setFieldTokens] = useQueryState('f', fieldTokensParser.withDefault([]));

  const [keyDeserializer, setKeyDeserializer] = useQueryStateWithCallback<PayloadEncoding>(
    {
      onUpdate: (val) => setSearchParams(topicName, { keyDeserializer: val }),
      getDefaultValue: () => getSearchParams(topicName)?.keyDeserializer ?? PayloadEncoding.UNSPECIFIED,
    },
    'kd',
    parseAsInteger.withDefault(PayloadEncoding.UNSPECIFIED)
  );

  const [valueDeserializer, setValueDeserializer] = useQueryStateWithCallback<PayloadEncoding>(
    {
      onUpdate: (val) => setSearchParams(topicName, { valueDeserializer: val }),
      getDefaultValue: () => getSearchParams(topicName)?.valueDeserializer ?? PayloadEncoding.UNSPECIFIED,
    },
    'vd',
    parseAsInteger.withDefault(PayloadEncoding.UNSPECIFIED)
  );

  const [pageIndex, setPageIndex] = useQueryState('page', parseAsInteger.withDefault(0));

  const [pageSize, setPageSize] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => setSearchParams(topicName, { pageSize: val }),
      getDefaultValue: () => getSearchParams(topicName)?.pageSize ?? DEFAULT_MAX_RESULTS,
    },
    'pageSize',
    parseAsInteger.withDefault(DEFAULT_MAX_RESULTS)
  );

  const [sorting, setSortingState] = useQueryStateWithCallback<SortingState>(
    {
      onUpdate: (val) => setSorting(topicName, val),
      getDefaultValue: () => getSorting(topicName),
    },
    'sort',
    sortingParser.withDefault(DEFAULT_SORTING)
  );

  const [continuousMode, setContinuousMode] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => setSearchParams(topicName, { continuousPaginationEnabled: val }),
      getDefaultValue: () => getSearchParams(topicName)?.continuousPaginationEnabled ?? false,
    },
    'inf',
    parseAsBoolean.withDefault(false)
  );

  const [liveTail, setLiveTail] = useQueryState('live', parseAsBoolean.withDefault(false));

  // Selected message (`partition-offset`), so a reload or shared link reopens the detail
  const [selectedKey, setSelectedKey] = useQueryState('selected', parseAsString);

  // Migrate legacy live-tail URLs (`o=-3`) to the orthogonal `live` param
  useEffect(() => {
    if (startOffset === PartitionOffsetOrigin.End) {
      setStartOffset(PartitionOffsetOrigin.EndMinusResults);
      setLiveTail(true);
    }
  }, [startOffset, setStartOffset, setLiveTail]);

  const readScopeMode = readScopeModeFromOffset(startOffset);

  const setReadScopeMode = useCallback(
    (mode: ReadScopeMode, customOffset = 0) => {
      setStartOffset(offsetForReadScopeMode(mode, customOffset));
      setPageIndex(0);
    },
    [setStartOffset, setPageIndex]
  );

  return {
    partitionId,
    setPartitionId,
    maxResults,
    setMaxResults,
    startOffset,
    setStartOffset,
    startTimestamp,
    setStartTimestamp,
    quickSearch,
    setQuickSearch,
    fieldTokens,
    setFieldTokens,
    keyDeserializer,
    setKeyDeserializer,
    valueDeserializer,
    setValueDeserializer,
    pageIndex,
    setPageIndex,
    pageSize,
    setPageSize,
    sorting,
    setSortingState,
    continuousMode,
    setContinuousMode,
    liveTail,
    setLiveTail,
    selectedKey,
    setSelectedKey,
    readScopeMode,
    setReadScopeMode,
  };
}

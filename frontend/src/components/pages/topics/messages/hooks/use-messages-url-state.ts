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

const escapeToken = (text: string) => text.replace(/%/gu, '%25').replace(/,/gu, '%2C');
const unescapeToken = (text: string) => text.replace(/%2C/gu, ',').replace(/%25/gu, '%');

/**
 * Escapes delimiters in shared field-token links. JavaScript filters are not encoded in the URL.
 */
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
export function readScopeModeFromOffset(startOffset: number) {
  switch (startOffset) {
    case PartitionOffsetOrigin.Start:
      return 'oldest' as const;
    case PartitionOffsetOrigin.Timestamp:
      return 'timestamp' as const;
    case PartitionOffsetOrigin.EndMinusResults:
      return 'newest' as const;
    default:
      return startOffset >= 0 ? ('offset' as const) : ('newest' as const);
  }
}

export function offsetForReadScopeMode(mode: ReadScopeMode, customOffset: number) {
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

function useReadScopeParams(topicName: string) {
  const { setSearchParams, getSearchParams } = useTopicSettingsStore();

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

  return {
    partitionId,
    setPartitionId,
    maxResults,
    setMaxResults,
    startOffset,
    setStartOffset,
    startTimestamp,
    setStartTimestamp,
  };
}

function useFilterParams() {
  const [quickSearch, setQuickSearch] = useQueryState('q', parseAsString.withDefault(''));

  const [fieldTokens, setFieldTokens] = useQueryState('f', fieldTokensParser.withDefault([]));

  return { quickSearch, setQuickSearch, fieldTokens, setFieldTokens };
}

function useDecodingParams(topicName: string) {
  const { setSearchParams, getSearchParams } = useTopicSettingsStore();

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

  const [schemaContext, setSchemaContext] = useQueryStateWithCallback<string>(
    {
      onUpdate: (val) => setSearchParams(topicName, { schemaContext: val }),
      getDefaultValue: () => getSearchParams(topicName)?.schemaContext ?? '',
    },
    'sc',
    parseAsString.withDefault('')
  );

  return {
    keyDeserializer,
    setKeyDeserializer,
    valueDeserializer,
    setValueDeserializer,
    schemaContext,
    setSchemaContext,
  };
}

function usePagingParams(topicName: string) {
  const { setSearchParams, getSearchParams, setSorting, getSorting } = useTopicSettingsStore();

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

  return { pageIndex, setPageIndex, pageSize, setPageSize, sorting, setSortingState };
}

function useStreamModeParams(topicName: string) {
  const { setSearchParams, getSearchParams } = useTopicSettingsStore();

  const [continuousMode, setContinuousMode] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => setSearchParams(topicName, { continuousPaginationEnabled: val }),
      getDefaultValue: () => getSearchParams(topicName)?.continuousPaginationEnabled ?? false,
    },
    'inf',
    parseAsBoolean.withDefault(false)
  );

  const [liveTail, setLiveTail] = useQueryState('live', parseAsBoolean.withDefault(false));

  const [selectedKey, setSelectedKey] = useQueryState('selected', parseAsString);

  return { continuousMode, setContinuousMode, liveTail, setLiveTail, selectedKey, setSelectedKey };
}

type ReadScopeParams = ReturnType<typeof useReadScopeParams>;

function useReadScopeMode(
  { startOffset, setStartOffset, startTimestamp, setStartTimestamp }: ReadScopeParams,
  setLiveTail: ReturnType<typeof useStreamModeParams>['setLiveTail'],
  setPageIndex: ReturnType<typeof usePagingParams>['setPageIndex']
) {
  useEffect(() => {
    if (startOffset === PartitionOffsetOrigin.End) {
      setStartOffset(PartitionOffsetOrigin.EndMinusResults);
      setLiveTail(true);
    }
  }, [startOffset, setStartOffset, setLiveTail]);

  const readScopeMode = readScopeModeFromOffset(startOffset);

  useEffect(() => {
    if (readScopeMode === 'timestamp' && startTimestamp < 0) {
      setStartTimestamp(Date.now());
    }
  }, [readScopeMode, startTimestamp, setStartTimestamp]);

  const setReadScopeMode = useCallback(
    (mode: ReadScopeMode, customOffset = 0) => {
      setStartOffset(offsetForReadScopeMode(mode, customOffset));
      setPageIndex(0);
      if (mode === 'timestamp') {
        if (startTimestamp < 0) {
          setStartTimestamp(Date.now());
        }
      } else {
        setStartTimestamp(-1);
      }
    },
    [setStartOffset, setPageIndex, setStartTimestamp, startTimestamp]
  );

  return { readScopeMode, setReadScopeMode };
}

/**
 * URL-backed search state for the messages page (same query keys as the legacy
 * viewer so shared links keep working), mirrored into the per-topic Zustand store.
 *
 * `live` is new: live tail is orthogonal to the read scope. Legacy URLs with
 * `o=-3` (PartitionOffsetOrigin.End) are migrated to `live=true` + newest scope.
 * Timestamp scope defaults to now when a deep link omits the timestamp, and switching away clears the saved timestamp.
 *
 * Scope, limits, and decoders also mirror into per-topic settings; text and field-token filters stay in the URL. Legacy live-tail offsets migrate to the separate live flag.
 */
export function useMessagesUrlState(topicName: string) {
  // WARNING: Keep the original query-key order; independent first-render URL synchronizations run in that order.
  const readScope = useReadScopeParams(topicName);
  const filters = useFilterParams();
  const decoding = useDecodingParams(topicName);
  const paging = usePagingParams(topicName);
  const streamMode = useStreamModeParams(topicName);
  const mode = useReadScopeMode(readScope, streamMode.setLiveTail, paging.setPageIndex);

  return { ...readScope, ...filters, ...decoding, ...paging, ...streamMode, ...mode };
}

export type MessagesUrlState = ReturnType<typeof useMessagesUrlState>;

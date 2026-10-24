/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import type { SortingState } from '@tanstack/react-table';
import { parseAsBoolean, parseAsInteger, parseAsString } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useQueryStateWithCallback } from '../../../../../hooks/use-query-state-with-callback';
import { PayloadEncoding } from '../../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { TopicMessage } from '../../../../../state/rest-interfaces';
import { DEFAULT_SEARCH_PARAMS, type FilterEntry } from '../../../../../state/ui';
import { DEFAULT_SORTING, useTopicSettingsStore } from '../../../../../stores/topic-settings-store';
import { sortingParser } from '../../../../../utils/sorting-parser';
import { getTopicFilters, setTopicFilters } from '../../../../../utils/topic-filters-session';

/** The topic's stored view settings: preview options and the dynamic filters shown in the toolbar. */
export function useTopicViewSettings(topicName: string) {
  // Zustand store for topic settings
  const { setTopicSettings, perTopicSettings } = useTopicSettingsStore();

  // Access perTopicSettings directly to trigger re-renders when Zustand state changes
  const topicSettings = perTopicSettings.find((t) => t.topicName === topicName);

  // Helper functions for managing dynamic filters
  const addDynamicFilter = useCallback(
    (filter: 'partition') => {
      const currentFilters = topicSettings?.dynamicFilters ?? [];
      if (!currentFilters.includes(filter)) {
        setTopicSettings(topicName, {
          dynamicFilters: [...currentFilters, filter],
        });
      }
    },
    [topicName, topicSettings?.dynamicFilters, setTopicSettings]
  );

  const removeDynamicFilter = useCallback(
    (filter: 'partition') => {
      const currentFilters = topicSettings?.dynamicFilters ?? [];
      setTopicSettings(topicName, {
        dynamicFilters: currentFilters.filter((f) => f !== filter),
      });
    },
    [topicName, topicSettings?.dynamicFilters, setTopicSettings]
  );

  // Convert @computed activePreviewTags to useMemo
  const activePreviewTags = useMemo(
    () => (topicSettings?.previewTags ?? []).filter((t) => t.isActive),
    [topicSettings?.previewTags]
  );

  return {
    topicSettings,
    previewDisplayMode: topicSettings?.previewDisplayMode ?? 'wrap',
    dynamicFilters: topicSettings?.dynamicFilters ?? [],
    addDynamicFilter,
    removeDynamicFilter,
    activePreviewTags,
  };
}

/** What to search for, kept in the URL and mirrored into the stored search params. */
export function useMessageQueryParams(topicName: string) {
  const { setSearchParams, getSearchParams } = useTopicSettingsStore();

  // URL query state management with localStorage sync
  const [partitionID, setPartitionID] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        setSearchParams(topicName, { partitionID: val });
      },
      getDefaultValue: () => getSearchParams(topicName)?.partitionID ?? DEFAULT_SEARCH_PARAMS.partitionID,
    },
    'p',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.partitionID)
  );

  const [maxResults, setMaxResults] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        setSearchParams(topicName, { maxResults: val });
      },
      getDefaultValue: () => getSearchParams(topicName)?.maxResults ?? DEFAULT_SEARCH_PARAMS.maxResults,
    },
    's',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.maxResults)
  );

  const [startOffset, setStartOffset] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        setSearchParams(topicName, { startOffset: val });
      },
      getDefaultValue: () => getSearchParams(topicName)?.startOffset ?? DEFAULT_SEARCH_PARAMS.startOffset,
    },
    'o',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.startOffset)
  );

  const [startTimestamp, setStartTimestamp] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        setSearchParams(topicName, { startTimestamp: val, startTimestampWasSetByUser: true });
      },
      getDefaultValue: () => getSearchParams(topicName)?.startTimestamp ?? DEFAULT_SEARCH_PARAMS.startTimestamp,
    },
    't',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.startTimestamp)
  );

  // Deserializer settings with URL state management
  const [keyDeserializer, setKeyDeserializer] = useQueryStateWithCallback<PayloadEncoding>(
    {
      onUpdate: (val) => {
        setSearchParams(topicName, { keyDeserializer: val });
      },
      getDefaultValue: () => getSearchParams(topicName)?.keyDeserializer ?? PayloadEncoding.UNSPECIFIED,
    },
    'kd',
    parseAsInteger.withDefault(PayloadEncoding.UNSPECIFIED)
  );

  const [valueDeserializer, setValueDeserializer] = useQueryStateWithCallback<PayloadEncoding>(
    {
      onUpdate: (val) => {
        setSearchParams(topicName, { valueDeserializer: val });
      },
      getDefaultValue: () => getSearchParams(topicName)?.valueDeserializer ?? PayloadEncoding.UNSPECIFIED,
    },
    'vd',
    parseAsInteger.withDefault(PayloadEncoding.UNSPECIFIED)
  );

  const [schemaContext, setSchemaContext] = useQueryStateWithCallback<string>(
    {
      onUpdate: (val) => {
        setSearchParams(topicName, { schemaContext: val });
      },
      getDefaultValue: () => getSearchParams(topicName)?.schemaContext ?? '',
    },
    'sc',
    parseAsString.withDefault('')
  );

  return {
    partitionID,
    setPartitionID,
    maxResults,
    setMaxResults,
    startOffset,
    setStartOffset,
    startTimestamp,
    setStartTimestamp,
    keyDeserializer,
    setKeyDeserializer,
    valueDeserializer,
    setValueDeserializer,
    schemaContext,
    setSchemaContext,
  };
}

export type MessageQueryParams = ReturnType<typeof useMessageQueryParams>;

/** Paging and sorting of the results table, kept in the URL. */
export function useMessagePagingParams(topicName: string, maxResults: number) {
  const { setSorting, getSorting, setSearchParams, getSearchParams } = useTopicSettingsStore();

  // Pagination state managed by nuqs
  const [pageIndex, setPageIndex] = useQueryStateWithCallback<number>(
    {
      onUpdate: () => {
        // Page index is just for URL state, no need to sync to uiState
      },
      getDefaultValue: () => 0,
    },
    'page',
    parseAsInteger.withDefault(0)
  );

  const [pageSize, setPageSize] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        setSearchParams(topicName, { pageSize: val });
      },
      getDefaultValue: () => getSearchParams(topicName)?.pageSize ?? DEFAULT_SEARCH_PARAMS.pageSize,
    },
    'pageSize',
    parseAsInteger.withDefault(50)
  );

  // Sorting state managed by nuqs with Zustand store sync
  const [sorting, setSortingState] = useQueryStateWithCallback<SortingState>(
    {
      onUpdate: (val) => {
        setSorting(topicName, val);
      },
      getDefaultValue: () => getSorting(topicName),
    },
    'sort',
    sortingParser.withDefault(DEFAULT_SORTING)
  );

  // Continuous pagination toggle state
  const [continuousPaginationEnabled, setContinuousPaginationEnabled] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        setSearchParams(topicName, { continuousPaginationEnabled: val });
      },
      getDefaultValue: () => getSearchParams(topicName)?.continuousPaginationEnabled ?? false,
    },
    'inf',
    parseAsBoolean.withDefault(false)
  );

  // Clear sorting when enabling continuous pagination mode
  useEffect(() => {
    if (continuousPaginationEnabled && sorting.length > 0) {
      setSortingState([]);
    }
  }, [continuousPaginationEnabled, sorting.length, setSortingState]);

  // Auto-cap page size to maxResults when continuous pagination is enabled
  useEffect(() => {
    if (continuousPaginationEnabled && maxResults < pageSize) {
      setPageSize(maxResults);
    }
  }, [continuousPaginationEnabled, maxResults, pageSize, setPageSize]);

  return {
    pageIndex,
    setPageIndex,
    pageSize,
    setPageSize,
    sorting,
    setSortingState,
    continuousPaginationEnabled,
    setContinuousPaginationEnabled,
  };
}

export type MessagePagingParams = ReturnType<typeof useMessagePagingParams>;

/** JavaScript filters, kept in session storage rather than the URL. */
export function useTopicFilters(topicName: string) {
  // Filters with session storage (NOT in URL)
  const [filters, setFilters] = useState<FilterEntry[]>(() => getTopicFilters(topicName));

  // Sync filters to session storage whenever they change
  useEffect(() => {
    setTopicFilters(topicName, filters);
  }, [filters, topicName]);

  return [filters, setFilters] as const;
}

/** Which of the view's dialogs is open; `downloadMessages` opens the save dialog for those messages. */
export function useMessageViewDialogs() {
  // Modal states
  const [showColumnSettingsModal, setShowColumnSettingsModal] = useState(false);
  const [showPreviewFieldsModal, setShowPreviewFieldsModal] = useState(false);
  const [showDeserializersModal, setShowDeserializersModal] = useState(false);
  const [downloadMessages, setDownloadMessages] = useState<TopicMessage[] | null>(null);

  return {
    showColumnSettingsModal,
    setShowColumnSettingsModal,
    showPreviewFieldsModal,
    setShowPreviewFieldsModal,
    showDeserializersModal,
    setShowDeserializersModal,
    downloadMessages,
    setDownloadMessages,
  };
}

export type TopicViewSettings = ReturnType<typeof useTopicViewSettings>;
export type MessageViewDialogs = ReturnType<typeof useMessageViewDialogs>;

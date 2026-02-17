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

import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, createMessageSearch, type MessageSearchRequest } from '../../../../state/backend-api';
import type { Topic, TopicMessage } from '../../../../state/rest-interfaces';
import {
  type DataColumnKey,
  DEFAULT_SEARCH_PARAMS,
  FilterEntry,
  PartitionOffsetOrigin,
  type PartitionOffsetOriginType,
} from '../../../../state/ui';
import { uiState } from '../../../../state/ui-state';
import '../../../../utils/array-extensions';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Box,
  Button,
  DataTable,
  Flex,
  Grid,
  GridItem,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Spinner,
  Switch,
  Tooltip,
  useBreakpoint,
  useToast,
} from '@redpanda-data/ui';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  AlertIcon,
  CalendarIcon,
  CodeIcon,
  DownloadIcon,
  ErrorIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PlayIcon,
  RefreshIcon,
  ReplyIcon,
  SettingsIcon,
  SkipBackIcon,
  TabIcon,
  TimerIcon,
  WarningIcon,
} from 'components/icons';
import { parseAsBoolean, parseAsInteger, parseAsString, useQueryState } from 'nuqs';

import { MessageSearchFilterBar } from './common/message-search-filter-bar';
import { SaveMessagesDialog } from './dialogs/save-messages-dialog';
import { StartOffsetDateTimePicker } from './forms/start-offset-date-time-picker';
import JavascriptFilterModal from './javascript-filter-modal';
import { ExpandedMessage } from './message-display/expanded-message';
import { MessageKeyPreview } from './message-display/message-key-preview';
import { MessagePreview } from './message-display/message-preview';
import { ColumnSettings } from './modals/column-settings';
import { DeserializersModal } from './modals/deserializers-modal';
import { PreviewFieldsModal } from './modals/preview-fields-modal';
import { isServerless } from '../../../../config';
import { useQueryStateWithCallback } from '../../../../hooks/use-query-state-with-callback';
import { PayloadEncoding } from '../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { appGlobal } from '../../../../state/app-global';
import { useTopicSettingsStore } from '../../../../stores/topic-settings-store';
import { IsDev } from '../../../../utils/env';
import { sanitizeString, wrapFilterFragment } from '../../../../utils/filter-helper';
import { onPaginationChange } from '../../../../utils/pagination';
import { sortingParser } from '../../../../utils/sorting-parser';
import { getTopicFilters, setTopicFilters } from '../../../../utils/topic-filters-session';
import {
  Label,
  navigatorClipboardErrorHandler,
  numberToThousandsString,
  StatusIndicator,
  TimestampDisplay,
} from '../../../../utils/tsx-utils';
import { encodeBase64, prettyBytes, prettyMilliseconds } from '../../../../utils/utils';
import { range } from '../../../misc/common';
import RemovableFilter from '../../../misc/removable-filter';
import { SingleSelect } from '../../../misc/select';

const payloadEncodingPairs = [
  { value: PayloadEncoding.UNSPECIFIED, label: 'Automatic' },
  { value: PayloadEncoding.NULL, label: 'None (Null)' },
  { value: PayloadEncoding.AVRO, label: 'AVRO' },
  { value: PayloadEncoding.PROTOBUF, label: 'Protobuf' },
  { value: PayloadEncoding.PROTOBUF_SCHEMA, label: 'Protobuf Schema' },
  { value: PayloadEncoding.JSON, label: 'JSON' },
  { value: PayloadEncoding.JSON_SCHEMA, label: 'JSON Schema' },
  { value: PayloadEncoding.XML, label: 'XML' },
  { value: PayloadEncoding.TEXT, label: 'Plain Text' },
  { value: PayloadEncoding.UTF8, label: 'UTF-8' },
  { value: PayloadEncoding.MESSAGE_PACK, label: 'Message Pack' },
  { value: PayloadEncoding.SMILE, label: 'Smile' },
  { value: PayloadEncoding.BINARY, label: 'Binary' },
  { value: PayloadEncoding.UINT, label: 'Unsigned Int' },
  { value: PayloadEncoding.CONSUMER_OFFSETS, label: 'Consumer Offsets' },
  { value: PayloadEncoding.CBOR, label: 'CBOR' },
];

const PAYLOAD_ENCODING_LABELS = payloadEncodingPairs.reduce(
  (acc, pair) => {
    acc[pair.value] = pair.label;
    return acc;
  },
  {} as Record<PayloadEncoding, string>
);

type TopicMessageViewProps = {
  topic: Topic;
  refreshTopicData: (force: boolean) => void;
};

// Define the column order as a constant
const COLUMN_ORDER: DataColumnKey[] = ['timestamp', 'partitionID', 'offset', 'key', 'value', 'keySize', 'valueSize'];

/*
    TODO:
        - when the user has entered a specific offset, we should prevent selecting 'all' partitions, as that wouldn't make any sense.
        - add back summary of quick search  <this.FilterSummary />
*/

function getMessageAsString(value: string | TopicMessage): string {
  if (typeof value === 'string') {
    return value;
  }

  const obj = { ...value } as Partial<TopicMessage>;
  obj.keyBinHexPreview = undefined;
  obj.valueBinHexPreview = undefined;
  obj.keyJson = undefined;
  obj.valueJson = undefined;
  if (obj.key) {
    obj.key.normalizedPayload = undefined;
    if (obj.key.rawBytes) {
      obj.key.rawBytes = Array.from(obj.key.rawBytes) as Uint8Array & number[];
    }
  }
  if (obj.value) {
    obj.value.normalizedPayload = undefined;
    if (obj.value.rawBytes) {
      obj.value.rawBytes = Array.from(obj.value.rawBytes) as Uint8Array & number[];
    }
  }

  return JSON.stringify(obj, null, 4);
}

function getPayloadAsString(value: string | Uint8Array | object): string {
  if (value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value instanceof Uint8Array) {
    return JSON.stringify(Array.from(value), null, 4);
  }

  return JSON.stringify(value, null, 4);
}

const defaultSelectChakraStyles = {
  control: (provided: Record<string, unknown>) => ({
    ...provided,
    minWidth: 'max-content',
  }),
  option: (provided: Record<string, unknown>) => ({
    ...provided,
    wordBreak: 'keep-all',
    whiteSpace: 'nowrap',
  }),
  menuList: (provided: Record<string, unknown>) => ({
    ...provided,
    minWidth: 'min-content',
  }),
} as const;

const maxResultsSelectChakraStyles = {
  control: (provided: Record<string, unknown>) => ({
    ...provided,
    minWidth: '140px', // Ensure enough width for "∞ Unlimited"
  }),
  option: (provided: Record<string, unknown>) => ({
    ...provided,
    wordBreak: 'keep-all',
    whiteSpace: 'nowrap',
  }),
  menuList: (provided: Record<string, unknown>) => ({
    ...provided,
    minWidth: '140px', // Match control width
  }),
} as const;

const inlineSelectChakraStyles = {
  ...defaultSelectChakraStyles,
  control: (provided: Record<string, unknown>) => ({
    ...provided,
    _hover: {
      borderColor: 'transparent',
    },
  }),
  container: (provided: Record<string, unknown>) => ({
    ...provided,
    borderColor: 'transparent',
  }),
} as const;

function onCopyValue(original: TopicMessage, toast: ReturnType<typeof useToast>) {
  navigator.clipboard
    .writeText(getPayloadAsString((original.value.payload ?? original.value.rawBytes) as string | Uint8Array | object))
    .then(() => {
      toast({
        status: 'success',
        description: 'Value copied to clipboard',
      });
    })
    .catch(navigatorClipboardErrorHandler);
}

function onCopyKey(original: TopicMessage, toast: ReturnType<typeof useToast>) {
  navigator.clipboard
    .writeText(getPayloadAsString((original.key.payload ?? original.key.rawBytes) as string | Uint8Array | object))
    .then(() => {
      toast({
        status: 'success',
        description: 'Key copied to clipboard',
      });
    })
    .catch(navigatorClipboardErrorHandler);
}

type LoadLargeMessageParams = {
  topicName: string;
  messagePartitionID: number;
  offset: number;
  setMessages: React.Dispatch<React.SetStateAction<TopicMessage[]>>;
  keyDeserializer: PayloadEncoding;
  valueDeserializer: PayloadEncoding;
};

async function loadLargeMessage({
  topicName,
  messagePartitionID,
  offset,
  setMessages,
  keyDeserializer,
  valueDeserializer,
}: LoadLargeMessageParams) {
  // Create a new search that looks for only this message specifically
  const search = createMessageSearch();
  const searchReq: MessageSearchRequest = {
    filterInterpreterCode: '',
    maxResults: 1,
    partitionId: messagePartitionID,
    startOffset: offset,
    startTimestamp: 0,
    topicName,
    includeRawPayload: true,
    ignoreSizeLimit: true,
    keyDeserializer,
    valueDeserializer,
  };
  const result = await search.startSearch(searchReq);

  if (result && result.length === 1) {
    // We must update the old message (that still says "payload too large")
    // So we just find its index and replace it in the array we are currently displaying
    setMessages((currentMessages) => {
      const indexOfOldMessage = currentMessages.findIndex(
        (x) => x.partitionID === messagePartitionID && x.offset === offset
      );
      if (indexOfOldMessage > -1) {
        const newMessages = [...currentMessages];
        newMessages[indexOfOldMessage] = result[0];
        return newMessages;
      }
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('LoadLargeMessage: cannot find old message to replace', {
        searchReq,
        result,
      });
      throw new Error(
        'LoadLargeMessage: Cannot find old message to replace (message results must have changed since the load was started)'
      );
    });
  } else {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('LoadLargeMessage: messages response is empty', { result });
    throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this is because of the refactoring effort, the scope will be minimised eventually
export const TopicMessageView: FC<TopicMessageViewProps> = (props) => {
  const toast = useToast();
  const breakpoint = useBreakpoint({ ssr: false });

  // Zustand store for topic settings
  const { setSorting, getSorting, setTopicSettings, perTopicSettings, setSearchParams, getSearchParams } =
    useTopicSettingsStore();

  // Access perTopicSettings directly to trigger re-renders when Zustand state changes
  const topicSettings = perTopicSettings.find((t) => t.topicName === props.topic.topicName);
  const previewDisplayMode = topicSettings?.previewDisplayMode ?? 'wrap';
  const dynamicFilters = topicSettings?.dynamicFilters ?? [];

  // Helper functions for managing dynamic filters
  const addDynamicFilter = useCallback(
    (filter: 'partition') => {
      const currentFilters = topicSettings?.dynamicFilters ?? [];
      if (!currentFilters.includes(filter)) {
        setTopicSettings(props.topic.topicName, {
          dynamicFilters: [...currentFilters, filter],
        });
      }
    },
    [props.topic.topicName, topicSettings?.dynamicFilters, setTopicSettings]
  );

  const removeDynamicFilter = useCallback(
    (filter: 'partition') => {
      const currentFilters = topicSettings?.dynamicFilters ?? [];
      setTopicSettings(props.topic.topicName, {
        dynamicFilters: currentFilters.filter((f) => f !== filter),
      });
    },
    [props.topic.topicName, topicSettings?.dynamicFilters, setTopicSettings]
  );

  // URL query state management with localStorage sync
  const [partitionID, setPartitionID] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        setSearchParams(props.topic.topicName, { partitionID: val });
      },
      getDefaultValue: () => getSearchParams(props.topic.topicName)?.partitionID ?? DEFAULT_SEARCH_PARAMS.partitionID,
    },
    'p',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.partitionID)
  );

  const [maxResults, setMaxResults] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        setSearchParams(props.topic.topicName, { maxResults: val });
      },
      getDefaultValue: () => getSearchParams(props.topic.topicName)?.maxResults ?? DEFAULT_SEARCH_PARAMS.maxResults,
    },
    's',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.maxResults)
  );

  const [startOffset, setStartOffset] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        setSearchParams(props.topic.topicName, { startOffset: val });
      },
      getDefaultValue: () => getSearchParams(props.topic.topicName)?.startOffset ?? DEFAULT_SEARCH_PARAMS.startOffset,
    },
    'o',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.startOffset)
  );

  const [startTimestamp, setStartTimestamp] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        setSearchParams(props.topic.topicName, { startTimestamp: val, startTimestampWasSetByUser: true });
      },
      getDefaultValue: () =>
        getSearchParams(props.topic.topicName)?.startTimestamp ?? DEFAULT_SEARCH_PARAMS.startTimestamp,
    },
    't',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.startTimestamp)
  );

  const [quickSearch, setQuickSearch] = useQueryState('q', parseAsString.withDefault(''));

  // Filters with session storage (NOT in URL)
  const [filters, setFilters] = useState<FilterEntry[]>(() => getTopicFilters(props.topic.topicName));

  // Sync filters to session storage whenever they change
  useEffect(() => {
    setTopicFilters(props.topic.topicName, filters);
  }, [filters, props.topic.topicName]);

  // Deserializer settings with URL state management
  const [keyDeserializer, setKeyDeserializer] = useQueryStateWithCallback<PayloadEncoding>(
    {
      onUpdate: (val) => {
        setSearchParams(props.topic.topicName, { keyDeserializer: val });
      },
      getDefaultValue: () => getSearchParams(props.topic.topicName)?.keyDeserializer ?? PayloadEncoding.UNSPECIFIED,
    },
    'kd',
    parseAsInteger.withDefault(PayloadEncoding.UNSPECIFIED)
  );

  const [valueDeserializer, setValueDeserializer] = useQueryStateWithCallback<PayloadEncoding>(
    {
      onUpdate: (val) => {
        setSearchParams(props.topic.topicName, { valueDeserializer: val });
      },
      getDefaultValue: () => getSearchParams(props.topic.topicName)?.valueDeserializer ?? PayloadEncoding.UNSPECIFIED,
    },
    'vd',
    parseAsInteger.withDefault(PayloadEncoding.UNSPECIFIED)
  );

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
        setSearchParams(props.topic.topicName, { pageSize: val });
      },
      getDefaultValue: () => getSearchParams(props.topic.topicName)?.pageSize ?? DEFAULT_SEARCH_PARAMS.pageSize,
    },
    'pageSize',
    parseAsInteger.withDefault(50)
  );

  // Sorting state managed by nuqs with Zustand store sync
  const [sorting, setSortingState] = useQueryStateWithCallback<SortingState>(
    {
      onUpdate: (val) => {
        setSorting(props.topic.topicName, val);
      },
      getDefaultValue: () => getSorting(props.topic.topicName),
    },
    'sort',
    sortingParser.withDefault([])
  );

  // Infinite scroll toggle state
  const [infiniteScrollEnabled, setInfiniteScrollEnabled] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        setSearchParams(props.topic.topicName, { infiniteScrollEnabled: val });
      },
      getDefaultValue: () => getSearchParams(props.topic.topicName)?.infiniteScrollEnabled ?? false,
    },
    'inf',
    parseAsBoolean.withDefault(false)
  );

  // Track total loaded count for trimming indicator
  const [totalLoadedCount, setTotalLoadedCount] = useState(0);

  // Modal states
  const [showColumnSettingsModal, setShowColumnSettingsModal] = useState(false);
  const [showPreviewFieldsModal, setShowPreviewFieldsModal] = useState(false);
  const [showDeserializersModal, setShowDeserializersModal] = useState(false);

  const [fetchError, setFetchError] = useState<Error | null>(null);
  const [downloadMessages, setDownloadMessages] = useState<TopicMessage[] | null>(null);

  // Search controls state
  const [customStartOffsetValue, setCustomStartOffsetValue] = useState<number | string>(0);
  const [currentJSFilter, setCurrentJSFilter] = useState<FilterEntry | null>(null);

  // Message search state
  const [messages, setMessages] = useState<TopicMessage[]>([]);
  const [virtualStartIndex, setVirtualStartIndex] = useState(0);
  const virtualStartIndexRef = useRef(0); // Ref to avoid stale closures in effects
  const [searchPhase, setSearchPhase] = useState<string | null>(null);
  const [bytesConsumed, setBytesConsumed] = useState(0);
  const [totalMessagesConsumed, setTotalMessagesConsumed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // Pagination state
  const [messageSearch, setMessageSearch] = useState<ReturnType<typeof createMessageSearch> | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const currentSearchRunRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevStartOffsetRef = useRef<number>(startOffset);
  const prevMaxResultsRef = useRef<number>(maxResults);
  const prevPageIndexRef = useRef<number>(pageIndex);
  const [forceRefresh, setForceRefresh] = useState(0);

  // Refs for tracking loadMore state to prevent stale closures and memory leaks
  const currentMessageSearchRef = useRef<ReturnType<typeof createMessageSearch> | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const [loadMoreFailures, setLoadMoreFailures] = useState(0);
  const isMountedRef = useRef(true);
  const MAX_LOAD_MORE_RETRIES = 3;
  // Track the page index and total when we last triggered loadMore to prevent cascading loads
  const lastLoadMoreRef = useRef<{ pageIndex: number; total: number }>({ pageIndex: -1, total: -1 });
  // Ref to track current pageIndex for use in async callbacks
  const pageIndexRef = useRef(pageIndex);
  // Track pending trim that was deferred because user was on last page
  // Note: pendingTrimRef was removed - trimming during active pagination was disabled
  // because it caused confusing page number shifts.

  // Filter messages based on quick search
  const baseFilteredMessages = quickSearch
    ? messages.filter((m) => {
        const searchStr = quickSearch.toLowerCase();
        return (
          m.offset.toString().toLowerCase().includes(searchStr) ||
          m.keyJson?.toLowerCase().includes(searchStr) ||
          m.valueJson?.toLowerCase().includes(searchStr)
        );
      })
    : messages;

  // For infinite scroll, just use the filtered messages directly
  // We don't use placeholders as they cause page content to shift
  const filteredMessages = baseFilteredMessages;

  // Convert @computed activePreviewTags to useMemo
  const activePreviewTags = useMemo(
    () => (topicSettings?.previewTags ?? []).filter((t) => t.isActive),
    [topicSettings?.previewTags]
  );

  // Keep currentMessageSearchRef in sync with messageSearch state
  useEffect(() => {
    currentMessageSearchRef.current = messageSearch;
  }, [messageSearch]);

  // Keep virtualStartIndexRef in sync
  useEffect(() => {
    virtualStartIndexRef.current = virtualStartIndex;
  }, [virtualStartIndex]);

  // Keep pageIndexRef in sync
  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);

  // Cleanup effect (replaces componentWillUnmount)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (loadMoreAbortRef.current) {
        loadMoreAbortRef.current.abort();
      }
      appGlobal.searchMessagesFunc = undefined;
    };
  }, []);

  // Clear sorting when enabling infinite scroll mode
  useEffect(() => {
    if (infiniteScrollEnabled && sorting.length > 0) {
      setSortingState([]);
    }
  }, [infiniteScrollEnabled, sorting.length, setSortingState]);

  // Reset to page 1 when start offset changes (e.g., switching from Newest to Beginning)
  useEffect(() => {
    // Only reset if startOffset actually changed (not on initial mount or re-renders)
    if (prevStartOffsetRef.current !== startOffset) {
      setPageIndex(0);
      prevStartOffsetRef.current = startOffset;
    }
  }, [startOffset, setPageIndex]);

  // Reset to page 1 when max results changes (e.g., switching from Unlimited to fixed size)
  useEffect(() => {
    // Only reset if maxResults actually changed (not on initial mount or re-renders)
    if (prevMaxResultsRef.current !== maxResults) {
      setPageIndex(0);
      prevMaxResultsRef.current = maxResults;
    }
  }, [maxResults, setPageIndex]);

  // Convert executeMessageSearch to useCallback
  const executeMessageSearch = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complex business logic
    async (abortSignal?: AbortSignal): Promise<TopicMessage[]> => {
      const canUseFilters =
        (api.topicPermissions.get(props.topic.topicName)?.canUseSearchFilters ?? true) && !isServerless();

      let filterCode = '';
      if (canUseFilters) {
        const functionNames: string[] = [];
        const functions: string[] = [];

        // Use filters from URL state instead of localStorage
        const filteredSearchParams = filters.filter(
          (searchParam) => searchParam.isActive && searchParam.code && searchParam.transpiledCode
        );

        for (const searchParam of filteredSearchParams) {
          const name = `filter${functionNames.length + 1}`;
          functionNames.push(name);
          functions.push(`function ${name}() {
                    ${wrapFilterFragment(searchParam.transpiledCode)}
                }`);
        }

        if (functions.length > 0) {
          filterCode = `${functions.join('\n\n')}\n\nreturn ${functionNames.map((f) => `${f}()`).join(' && ')}`;
          if (IsDev) {
            // biome-ignore lint/suspicious/noConsole: intentional console usage
            console.log(`constructed filter code (${functions.length} functions)`, `\n\n${filterCode}`);
          }
        }
      }

      // Calculate backend page size: for infinite scroll mode,
      // initial load fetches maxResults at once, subsequent loadMore calls use smaller pageSize.
      // We send maxResults as pageSize to enable pagination mode in the backend.
      const backendPageSize = infiniteScrollEnabled ? maxResults : undefined;
      const backendMaxResults = maxResults;

      const request = {
        topicName: props.topic.topicName,
        partitionId: partitionID,
        startOffset,
        startTimestamp,
        maxResults: backendMaxResults,
        pageSize: backendPageSize,
        filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
        includeRawPayload: true,
        keyDeserializer,
        valueDeserializer,
      } as MessageSearchRequest;

      try {
        setFetchError(null);
        setSearchPhase('Searching...');

        const search = createMessageSearch();
        setMessageSearch(search);
        const startTime = Date.now();

        const result = await search.startSearch(request, abortSignal).catch((err: Error) => {
          const msg = err.message ?? String(err);
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.error(`error in searchTopicMessages: ${msg}`);
          setFetchError(err);
          setSearchPhase(null);
          return [];
        });

        const endTime = Date.now();
        setMessages(result);
        if (maxResults < pageSize) {
          lastLoadMoreRef.current = { pageIndex: 0, total: result.length };
        }
        setSearchPhase(null);
        setElapsedMs(endTime - startTime);
        setBytesConsumed(search.bytesConsumed);
        setTotalMessagesConsumed(search.totalMessagesConsumed);

        // Debug: log pagination state
        // biome-ignore lint/suspicious/noConsole: debug logging
        console.log('[Pagination Debug] Initial search complete:', {
          messagesCount: result.length,
          nextPageToken: search.nextPageToken,
          infiniteScrollEnabled,
          pageSize: backendPageSize,
          maxResults: backendMaxResults,
        });

        return result;
      } catch (error: unknown) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(`error in searchTopicMessages: ${(error as Error).message ?? String(error)}`);
        setFetchError(error as Error);
        setSearchPhase(null);
        return [];
      }
    },
    [
      props.topic.topicName,
      partitionID,
      startOffset,
      startTimestamp,
      maxResults,
      infiniteScrollEnabled,
      pageSize,
      getSearchParams,
      keyDeserializer,
      valueDeserializer,
      filters,
    ]
  );

  // Convert searchFunc to useCallback
  const searchFunc = useCallback(
    (source: 'auto' | 'manual') => {
      // Create search params signature (includes filters to detect changes)
      const filtersSignature = filters.map((f) => `${f.id}:${f.isActive}:${f.transpiledCode}`).join('|');
      const searchParams = `${startOffset} ${maxResults} ${partitionID} ${startTimestamp} ${keyDeserializer} ${valueDeserializer} ${filtersSignature}`;

      if (searchParams === currentSearchRunRef.current && source === 'auto') {
        return;
      }

      // Abort current search if one is running
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Start new search
      currentSearchRunRef.current = searchParams;
      abortControllerRef.current = new AbortController();

      // Clear messages immediately when starting new search
      setMessages([]);
      setVirtualStartIndex(0);
      lastLoadMoreRef.current = { pageIndex: -1, total: -1 };
      setLoadMoreFailures(0);

      try {
        executeMessageSearch(abortControllerRef.current?.signal)
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          .catch(console.error)
          .finally(() => {
            currentSearchRunRef.current = null;
            abortControllerRef.current = null;
          });
      } catch (err) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error('error in message search', { error: err });
      }
    },
    [
      startOffset,
      maxResults,
      partitionID,
      startTimestamp,
      executeMessageSearch,
      keyDeserializer,
      valueDeserializer,
      filters,
    ]
  );

  // Auto search when parameters change
  // biome-ignore lint/correctness/useExhaustiveDependencies: forceRefresh is intentionally watched to trigger forced re-search
  useEffect(() => {
    // Set up auto-search with 100ms delay
    const timer = setTimeout(() => {
      searchFunc('auto');
    }, 100);

    appGlobal.searchMessagesFunc = searchFunc;

    return () => clearTimeout(timer);
  }, [searchFunc, forceRefresh]);

  // Auto-load more messages when user reaches beyond loaded messages (infinite scroll mode only)
  useEffect(() => {
    // Only auto-load when infinite scroll is enabled and filters are not active
    if (
      !infiniteScrollEnabled ||
      filters.length > 0 ||
      !messageSearch ||
      !messageSearch.nextPageToken ||
      isLoadingMore ||
      searchPhase ||
      loadMoreFailures >= MAX_LOAD_MORE_RETRIES
    ) {
      return;
    }

    // Calculate if we need more messages for the current page based on virtual position
    // Use ref to get current value without adding to dependency array (prevents cascading)
    // In infinite scroll mode, use maxResults as the effective page size for load decisions.
    // The UI pageSize controls how many rows are displayed per table page, but maxResults
    // controls how many messages are fetched per backend request. We should only trigger
    // a new load when we need more data for the next maxResults-sized batch, not when the
    // UI page size exceeds what we've loaded.
    const effectivePageSize = infiniteScrollEnabled ? maxResults : pageSize;
    const totalVirtualMessages = virtualStartIndexRef.current + messages.length;
    const messagesNeededForPage = (pageIndex + 1) * effectivePageSize;

    // Check if we're on the last page of currently loaded data (including virtual/placeholder messages)
    const totalVirtualPages = Math.ceil(totalVirtualMessages / effectivePageSize);
    const isOnLastPage = pageIndex === totalVirtualPages - 1 && totalVirtualMessages > 0;

    // Need more messages if:
    // 1. Current page requires more than we have, OR
    // 2. We're on the last page and either:
    //    a. We haven't loaded for this page before, OR
    //    b. The total has increased since we last loaded (meaning we navigated away and back)
    const needsMoreForCurrentPage = messagesNeededForPage > totalVirtualMessages;
    const isNewPageOrTotalChanged =
      lastLoadMoreRef.current.pageIndex !== pageIndex || lastLoadMoreRef.current.total < totalVirtualMessages;
    const isNewLastPageRequest = isOnLastPage && isNewPageOrTotalChanged;
    const needsMoreMessages = needsMoreForCurrentPage || isNewLastPageRequest;

    // Debug: log loadMore decision
    // biome-ignore lint/suspicious/noConsole: debug logging
    console.log('[Pagination Debug] loadMore check:', {
      pageIndex,
      pageSize,
      messagesNeededForPage,
      totalVirtualMessages,
      isOnLastPage,
      isNewLastPageRequest,
      needsMoreMessages,
      hasNextPageToken: !!messageSearch.nextPageToken,
      messagesLength: messages.length,
      virtualStartIndexRef: virtualStartIndexRef.current,
      lastLoadMoreRef: lastLoadMoreRef.current,
      isLoadingMore,
    });

    if (needsMoreMessages && messageSearch.nextPageToken) {
      // Set the ref IMMEDIATELY to prevent duplicate loads from effect re-runs
      // We'll update with the actual total after load completes
      lastLoadMoreRef.current = { pageIndex, total: totalVirtualMessages };

      // Create abort controller for this loadMore operation
      const abortController = new AbortController();
      loadMoreAbortRef.current = abortController;

      // Capture the current messageSearch reference to detect stale responses
      const capturedMessageSearch = messageSearch;

      setIsLoadingMore(true);
      capturedMessageSearch
        .loadMore(maxResults)
        .then(() => {
          // Only update state if component is still mounted and this is still the current search
          if (isMountedRef.current && currentMessageSearchRef.current === capturedMessageSearch) {
            const allMessages = capturedMessageSearch.messages;
            const newMessages = [...allMessages];

            // Track total loaded count before trimming
            setTotalLoadedCount(allMessages.length);

            // Calculate the new virtual start index after potential trimming
            const newVirtualStartIndex = virtualStartIndexRef.current;

            // Note: We don't trim during active pagination to avoid confusing page number changes.
            // Memory is bounded by maxResults on initial load, and resets when user does a new
            // search or navigates back to page 1. This allows smooth pagination without jumps.
            // The virtualStartIndex/totalLoadedCount are kept for potential future use but
            // currently just track the total without trimming.

            // Update the ref BEFORE setting messages to prevent cascading
            // Use pageIndexRef.current to get the CURRENT page index, not the captured one
            // The new total is virtualStartIndex + newMessages.length
            lastLoadMoreRef.current = {
              pageIndex: pageIndexRef.current,
              total: newVirtualStartIndex + newMessages.length,
            };
            virtualStartIndexRef.current = newVirtualStartIndex;

            setMessages(newMessages);
            // Reset failure count on success
            setLoadMoreFailures(0);
          }
        })
        .catch((err) => {
          // Only show error if component is still mounted and not aborted
          if (isMountedRef.current && !abortController.signal.aborted) {
            setLoadMoreFailures((prev) => prev + 1);
            toast({
              title: 'Failed to load more messages',
              description: (err as Error).message,
              status: 'error',
              duration: 5000,
              isClosable: true,
            });
          }
        })
        .finally(() => {
          if (isMountedRef.current) {
            setIsLoadingMore(false);
          }
          if (loadMoreAbortRef.current === abortController) {
            loadMoreAbortRef.current = null;
          }
        });
    }

    return () => {
      if (loadMoreAbortRef.current) {
        loadMoreAbortRef.current.abort();
        loadMoreAbortRef.current = null;
      }
    };
    // Note: virtualStartIndex intentionally excluded from deps to prevent cascading loads after trimming
    // The effect uses the ref value directly which is always current
  }, [
    pageIndex,
    infiniteScrollEnabled,
    maxResults,
    filters.length,
    messageSearch,
    isLoadingMore,
    searchPhase,
    messages.length,
    pageSize,
    toast,
    loadMoreFailures,
    startOffset,
  ]);

  // Reset pagination when navigating back to page 1 in infinite scroll mode
  // This prevents keeping many pages in memory and triggering excessive requests
  useEffect(() => {
    // Check if we're in infinite scroll mode and user navigated back to page 1 from a higher page
    // Use ref to check messageSearch existence to avoid circular dependency
    if (infiniteScrollEnabled && pageIndex === 0 && prevPageIndexRef.current > 1 && currentMessageSearchRef.current) {
      // Clear the message search and state
      setMessages([]);
      setMessageSearch(null);
      // Reset failure count when resetting pagination
      setLoadMoreFailures(0);
      // Reset total loaded count
      setTotalLoadedCount(0);
      // Reset virtual start index for sliding window
      setVirtualStartIndex(0);
      // Reset last loadMore page tracking
      lastLoadMoreRef.current = { pageIndex: -1, total: -1 };
      // Clear the search run ref and trigger a forced refresh
      currentSearchRunRef.current = null;
      setForceRefresh((prev) => prev + 1);
    }
    prevPageIndexRef.current = pageIndex;
    // Note: messageSearch intentionally excluded to avoid circular dependency
    // We use currentMessageSearchRef.current instead which is always in sync
  }, [pageIndex, infiniteScrollEnabled]);

  // Note: Deferred trimming was removed because it caused confusing page number changes.
  // When we trimmed messages, page numbers would shift (e.g., page 6 becomes page 4),
  // which was disorienting for users. Instead, we let messages accumulate during active
  // pagination and reset everything when the user starts a new search or goes to page 1.

  // Message Table rendering variables and functions
  // Calculate pages based on loaded data, but in infinite scroll mode with more
  // data available, allow navigating one page beyond to trigger loadMore
  const loadedPages = Math.ceil(filteredMessages.length / pageSize);
  const hasMoreData = infiniteScrollEnabled && messageSearch?.nextPageToken;

  // Allow one extra page when more data is available - this enables the "next" button
  const totalPages = Math.max(1, hasMoreData ? loadedPages + 1 : loadedPages);
  const boundedPageIndex = Math.min(pageIndex, totalPages - 1);

  // Check if we're trying to view a page beyond our loaded data
  const isOnUnloadedPage = boundedPageIndex >= loadedPages && hasMoreData;

  const paginationParams = {
    pageIndex: isOnUnloadedPage ? loadedPages - 1 : boundedPageIndex, // Show last loaded page while loading
    pageSize,
  };

  const tsFormat = topicSettings?.previewTimestamps ?? 'default';
  const hasKeyTags = (topicSettings?.previewTags ?? []).filter((x) => x.isActive && x.searchInMessageKey).length > 0;

  const isValueDeserializerActive =
    valueDeserializer !== null && valueDeserializer !== undefined && valueDeserializer !== PayloadEncoding.UNSPECIFIED;
  const isKeyDeserializerActive =
    keyDeserializer !== null && keyDeserializer !== undefined && keyDeserializer !== PayloadEncoding.UNSPECIFIED;

  const dataTableColumns: Record<DataColumnKey, ColumnDef<TopicMessage>> = {
    offset: {
      header: 'Offset',
      accessorKey: 'offset',
      cell: ({
        row: {
          original: { offset },
        },
      }) => (offset < 0 ? <span className="text-muted-foreground">Loading...</span> : numberToThousandsString(offset)),
    },
    partitionID: {
      header: 'Partition',
      accessorKey: 'partitionID',
    },
    timestamp: {
      header: 'Timestamp',
      accessorKey: 'timestamp',
      enableSorting: !infiniteScrollEnabled, // Disable sorting in infinite scroll mode
      cell: ({
        row: {
          original: { timestamp },
        },
      }) => <TimestampDisplay format={tsFormat} unixEpochMillisecond={timestamp} />,
    },
    key: {
      header: () =>
        isKeyDeserializerActive ? (
          <Flex alignItems="center" display="inline-flex" gap={2}>
            Key{' '}
            <button
              onClick={(e) => {
                setShowDeserializersModal(true);
                e.stopPropagation(); // don't sort
              }}
              type="button"
            >
              <Badge>Deserializer: {PAYLOAD_ENCODING_LABELS[keyDeserializer]}</Badge>
            </button>
          </Flex>
        ) : (
          'Key'
        ),
      size: hasKeyTags ? 300 : 1,
      accessorKey: 'key',
      enableSorting: !infiniteScrollEnabled, // Disable sorting in infinite scroll mode
      cell: ({ row: { original } }) => (
        <MessageKeyPreview
          msg={original}
          previewDisplayMode={previewDisplayMode}
          previewFields={() => activePreviewTags}
        />
      ),
    },
    value: {
      header: () =>
        isValueDeserializerActive ? (
          <Flex alignItems="center" display="inline-flex" gap={2}>
            Value{' '}
            <button
              onClick={(e) => {
                setShowDeserializersModal(true);
                e.stopPropagation(); // don't sort
              }}
              type="button"
            >
              <Badge>Deserializer: {PAYLOAD_ENCODING_LABELS[valueDeserializer]}</Badge>
            </button>
          </Flex>
        ) : (
          'Value'
        ),
      accessorKey: 'value',
      enableSorting: !infiniteScrollEnabled, // Disable sorting in infinite scroll mode
      cell: ({ row: { original } }) => (
        <MessagePreview
          isCompactTopic={props.topic.cleanupPolicy.includes('compact')}
          msg={original}
          previewDisplayMode={previewDisplayMode}
          previewFields={() => activePreviewTags}
        />
      ),
    },
    keySize: {
      header: 'Key Size',
      accessorKey: 'key.size',
      cell: ({
        row: {
          original: {
            key: { size },
          },
        },
      }) => <span>{prettyBytes(size)}</span>,
    },
    valueSize: {
      header: 'Value Size',
      accessorKey: 'value.size',
      cell: ({
        row: {
          original: {
            value: { size },
          },
        },
      }) => <span>{prettyBytes(size)}</span>,
    },
  };

  const columnsVisibleByDefault: DataColumnKey[] = ['timestamp', 'key', 'value'];

  const newColumns: ColumnDef<TopicMessage>[] = columnsVisibleByDefault.map((key) => dataTableColumns[key]);

  const previewColumnFields = topicSettings?.previewColumnFields ?? [];
  if (previewColumnFields.length > 0) {
    newColumns.splice(0, newColumns.length);

    // let's be defensive and remove any duplicates before showing in the table
    const selectedColumns = new Set(previewColumnFields.map((field) => field.dataIndex));

    for (const column of COLUMN_ORDER) {
      if (selectedColumns.has(column)) {
        newColumns.push(dataTableColumns[column]);
      }
    }
  }

  if (newColumns.length > 0) {
    const lastColumn = newColumns.at(-1);
    if (lastColumn) {
      lastColumn.size = Number.POSITIVE_INFINITY;
    }
  }

  const columns: ColumnDef<TopicMessage>[] = [
    ...newColumns,
    {
      id: 'action',
      size: 0,
      cell: ({ row: { original } }) => (
        <Menu computePositionOnMount>
          <MenuButton as={Button} className="iconButton" variant="link">
            <MoreHorizontalIcon />
          </MenuButton>
          <MenuList>
            <MenuItem
              onClick={() => {
                navigator.clipboard
                  .writeText(getMessageAsString(original))
                  .then(() => {
                    toast({
                      status: 'success',
                      description: 'Message copied to clipboard',
                    });
                  })
                  .catch(navigatorClipboardErrorHandler);
              }}
            >
              Copy Message
            </MenuItem>
            <MenuItem isDisabled={original.key.isPayloadNull} onClick={() => onCopyKey(original, toast)}>
              Copy Key
            </MenuItem>
            <MenuItem isDisabled={original.value.isPayloadNull} onClick={() => onCopyValue(original, toast)}>
              Copy Value
            </MenuItem>
            <MenuItem
              onClick={() => {
                navigator.clipboard
                  .writeText(original.timestamp.toString())
                  .then(() => {
                    toast({
                      status: 'success',
                      description: 'Epoch Timestamp copied to clipboard',
                    });
                  })
                  .catch(navigatorClipboardErrorHandler);
              }}
            >
              Copy Epoch Timestamp
            </MenuItem>
            <MenuItem
              onClick={() => {
                setDownloadMessages([original]);
              }}
            >
              Save to File
            </MenuItem>
          </MenuList>
        </Menu>
      ),
    },
  ];

  // Search controls derived state
  const canUseFilters =
    (api.topicPermissions.get(props.topic.topicName)?.canUseSearchFilters ?? true) && !isServerless();
  const customStartOffsetValid = !Number.isNaN(Number(customStartOffsetValue));

  const startOffsetOptions = [
    {
      value: PartitionOffsetOrigin.End,
      label: (
        <Flex alignItems="center" gap={2}>
          <PlayIcon />
          <span data-testid="start-offset-latest-live">Latest / Live</span>
        </Flex>
      ),
    },
    {
      value: PartitionOffsetOrigin.EndMinusResults,
      label: (
        <Flex alignItems="center" gap={2}>
          <ReplyIcon />
          <span data-testid="start-offset-newest">
            {infiniteScrollEnabled ? 'Newest' : `Newest - ${String(maxResults)}`}
          </span>
        </Flex>
      ),
    },
    {
      value: PartitionOffsetOrigin.Start,
      label: (
        <Flex alignItems="center" gap={2}>
          <SkipBackIcon />
          <span data-testid="start-offset-beginning">Beginning</span>
        </Flex>
      ),
    },
    {
      value: PartitionOffsetOrigin.Custom,
      label: (
        <Flex alignItems="center" gap={2}>
          <TabIcon />
          <span data-testid="start-offset-custom">Offset</span>
        </Flex>
      ),
    },
    {
      value: PartitionOffsetOrigin.Timestamp,
      label: (
        <Flex alignItems="center" gap={2}>
          <CalendarIcon />
          <span data-testid="start-offset-timestamp">Timestamp</span>
        </Flex>
      ),
    },
  ];

  const currentOffsetOrigin = (
    startOffset >= 0 ? PartitionOffsetOrigin.Custom : startOffset
  ) as PartitionOffsetOriginType;

  // Return JSX for the component
  return (
    <>
      <Grid gap={3} gridTemplateColumns="auto 1fr" my={4} width="full">
        <GridItem display="flex" gap={3} gridColumn={{ base: '1/-1', md: '1' }}>
          <Label text="Start Offset">
            <Flex gap={3}>
              <SingleSelect<PartitionOffsetOriginType>
                chakraStyles={defaultSelectChakraStyles}
                data-testid="start-offset-dropdown"
                onChange={(e) => {
                  if (e === PartitionOffsetOrigin.Custom) {
                    if (startOffset < 0) {
                      setStartOffset(0);
                    }
                  } else {
                    setStartOffset(e);
                  }

                  // Handle timestamp parameter in URL
                  if (e === PartitionOffsetOrigin.Timestamp) {
                    // Set timestamp to now when switching TO Timestamp mode
                    if (startTimestamp === -1) {
                      setStartTimestamp(Date.now());
                    }
                  } else {
                    // Clear timestamp from URL when switching away from Timestamp
                    setStartTimestamp(null);
                  }
                }}
                options={startOffsetOptions}
                value={currentOffsetOrigin}
              />
              {currentOffsetOrigin === PartitionOffsetOrigin.Custom && (
                <Tooltip hasArrow isOpen={!customStartOffsetValid} label="Offset must be a number" placement="right">
                  <Input
                    isDisabled={currentOffsetOrigin !== PartitionOffsetOrigin.Custom}
                    maxLength={20}
                    onChange={(e) => {
                      setCustomStartOffsetValue(e.target.value);
                      if (!Number.isNaN(Number(e.target.value))) {
                        setStartOffset(Number(e.target.value));
                      }
                    }}
                    style={{ width: '7.5em' }}
                    value={customStartOffsetValue}
                  />
                </Tooltip>
              )}
              {currentOffsetOrigin === PartitionOffsetOrigin.Timestamp && (
                <StartOffsetDateTimePicker
                  onChange={setStartTimestamp}
                  topicName={props.topic.topicName}
                  value={startTimestamp}
                />
              )}
            </Flex>
          </Label>

          <Label text="Max Results">
            <SingleSelect<number>
              chakraStyles={maxResultsSelectChakraStyles}
              data-testid="max-results-select"
              onChange={(c) => {
                setMaxResults(c);
              }}
              options={[...[1, 3, 5, 10, 20, 50, 100, 200, 500, 1000, 10_000].map((i) => ({ value: i }))]}
              value={maxResults}
            />
          </Label>

          <Label text="Infinite Scroll">
            <Switch
              data-testid="infinite-scroll-toggle"
              isChecked={infiniteScrollEnabled}
              onChange={(e) => setInfiniteScrollEnabled(e.target.checked)}
            />
          </Label>

          {dynamicFilters.map(
            (filter) =>
              ({
                partition: (
                  <Label text="Partition">
                    <RemovableFilter
                      onRemove={() => {
                        removeDynamicFilter('partition');
                        setPartitionID(DEFAULT_SEARCH_PARAMS.partitionID);
                      }}
                    >
                      <SingleSelect<number>
                        chakraStyles={inlineSelectChakraStyles}
                        onChange={(c) => {
                          setPartitionID(c);
                        }}
                        options={[
                          {
                            value: -1,
                            label: 'All',
                          },
                        ].concat(
                          range(0, props.topic.partitionCount).map((i) => ({
                            value: i,
                            label: String(i),
                          }))
                        )}
                        value={partitionID}
                      />
                    </RemovableFilter>
                  </Label>
                ),
              })[filter]
          )}

          <Flex alignItems="flex-end">
            <Menu>
              <MenuButton as={Button} data-testid="add-topic-filter" variant="outline">
                Add filter
              </MenuButton>
              <MenuList>
                <MenuItem
                  data-testid="add-topic-filter-partition"
                  icon={<LayersIcon size="1.5rem" />}
                  isDisabled={dynamicFilters.includes('partition')}
                  onClick={() => addDynamicFilter('partition')}
                >
                  Partition
                </MenuItem>
                <MenuDivider />
                <MenuItem
                  data-testid="add-topic-filter-javascript"
                  icon={<CodeIcon size="1.5rem" />}
                  isDisabled={!canUseFilters}
                  onClick={() => {
                    const filter = new FilterEntry();
                    setCurrentJSFilter(filter);
                  }}
                >
                  JavaScript Filter
                </MenuItem>
              </MenuList>
            </Menu>
          </Flex>

          {/* Search Progress Indicator: "Consuming Messages 30/30" */}
          {Boolean(searchPhase && searchPhase.length > 0) && (
            <StatusIndicator
              bytesConsumed={prettyBytes(bytesConsumed)}
              fillFactor={infiniteScrollEnabled ? 0 : messages.length / maxResults}
              identityKey="messageSearch"
              messagesConsumed={String(totalMessagesConsumed)}
              progressText={
                infiniteScrollEnabled && totalLoadedCount > messages.length
                  ? `${messages.length} / ${totalLoadedCount} loaded`
                  : `${messages.length} / ${maxResults}`
              }
              // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
              statusText={searchPhase!}
            />
          )}
        </GridItem>

        <GridItem alignItems="flex-end" display="flex" gap={3} justifyContent="flex-end">
          <Menu>
            <MenuButton
              as={IconButton}
              data-testid="message-settings-button"
              icon={<SettingsIcon size="1.5rem" />}
              variant="outline"
            />
            <MenuList>
              <MenuItem
                data-testid="deserialization-settings-menu-item"
                onClick={() => {
                  setShowDeserializersModal(true);
                }}
              >
                Deserialization
              </MenuItem>
              <MenuItem
                data-testid="column-settings-menu-item"
                onClick={() => {
                  setShowColumnSettingsModal(true);
                }}
              >
                Column settings
              </MenuItem>
              <MenuItem
                data-testid="preview-fields-menu-item"
                onClick={() => {
                  setShowPreviewFieldsModal(true);
                }}
              >
                Preview fields
              </MenuItem>
            </MenuList>
          </Menu>
          <Flex alignItems="flex-end">
            {/* Refresh Button */}
            {searchPhase === null && (
              <Tooltip hasArrow label="Repeat current search" placement="top">
                <IconButton
                  aria-label="Repeat current search"
                  data-testid="refresh-messages-button"
                  icon={<RefreshIcon />}
                  onClick={() => searchFunc('manual')}
                  variant="outline"
                />
              </Tooltip>
            )}
            {searchPhase !== null && (
              <Tooltip hasArrow label="Stop searching" placement="top">
                <IconButton
                  aria-label="Stop searching"
                  colorScheme="red"
                  data-testid="stop-search-button"
                  icon={<ErrorIcon />}
                  onClick={() => {
                    if (abortControllerRef.current) {
                      abortControllerRef.current.abort();
                    }
                  }}
                  variant="solid"
                />
              </Tooltip>
            )}
          </Flex>
        </GridItem>

        {/* Filter Tags */}
        <MessageSearchFilterBar
          filters={filters}
          onEdit={(filter) => {
            setCurrentJSFilter(filter);
          }}
          onRemove={(filterId) => {
            setFilters(filters.filter((f) => f.id !== filterId));
          }}
          onToggle={(filterId) => {
            setFilters(filters.map((f) => (f.id === filterId ? { ...f, isActive: !f.isActive } : f)));
          }}
        />

        <GridItem display="flex" gap={4} gridColumn="1/-1" mt={4}>
          {/* Quick Search */}
          <Input
            data-testid="message-quick-search-input"
            onChange={(x) => {
              setQuickSearch(x.target.value);
            }}
            placeholder="Filter table content ..."
            px={4}
            value={quickSearch}
          />
          <Flex alignItems="center" fontSize="sm" gap={2} whiteSpace="nowrap">
            {searchPhase === null || searchPhase === 'Done' ? (
              <>
                <Flex alignItems="center" gap={2}>
                  <DownloadIcon size={14} /> {prettyBytes(bytesConsumed)}
                </Flex>
                <Flex alignItems="center" gap={2}>
                  <TimerIcon size={14} /> {elapsedMs ? prettyMilliseconds(elapsedMs) : ''}
                </Flex>
              </>
            ) : (
              <>
                <span className="spinner" />
                <span className="pulsating">Fetching data...</span>
              </>
            )}
          </Flex>
        </GridItem>
      </Grid>

      {currentJSFilter ? (
        <JavascriptFilterModal
          currentFilter={currentJSFilter}
          onClose={() => setCurrentJSFilter(null)}
          onSave={(filter) => {
            // Check if filter exists in the array by ID
            const existingIndex = filters.findIndex((f) => f.id === filter.id);
            if (existingIndex >= 0) {
              // Update existing filter
              setFilters(filters.map((f) => (f.id === filter.id ? filter : f)));
            } else {
              // Add new filter
              setFilters([...filters, filter]);
            }
            searchFunc('manual');
          }}
        />
      ) : null}

      {/* Message Table (or error display) */}
      {fetchError ? (
        <Alert status="error">
          <Box alignSelf="flex-start">
            <AlertIcon />
          </Box>
          <Box>
            <AlertTitle>Backend Error</AlertTitle>
            <AlertDescription>
              <Box>Please check and modify the request before resubmitting.</Box>
              <Box mt="4">
                <div className="codeBox">{(fetchError as Error).message ?? String(fetchError)}</div>
              </Box>
              <Button mt="4" onClick={() => executeMessageSearch()}>
                Retry Search
              </Button>
            </AlertDescription>
          </Box>
        </Alert>
      ) : (
        <>
          <DataTable<TopicMessage>
            columns={columns}
            data={filteredMessages}
            data-testid="messages-table"
            emptyText="No messages"
            isLoading={searchPhase !== null}
            onPaginationChange={onPaginationChange(
              paginationParams,
              ({ pageSize: newPageSize, pageIndex: newPageIndex }) => {
                uiState.topicSettings.searchParams.pageSize = newPageSize;
                setPageIndex(newPageIndex);
                setPageSize(newPageSize);
              }
            )}
            onSortingChange={(newSorting) => {
              // Don't allow sorting changes in infinite scroll mode
              if (infiniteScrollEnabled) {
                return;
              }

              const updatedSorting: SortingState = typeof newSorting === 'function' ? newSorting(sorting) : newSorting;
              setSortingState(updatedSorting);
            }}
            pagination={paginationParams}
            size={['lg', 'md', 'sm'].includes(breakpoint) ? 'sm' : 'md'}
            sorting={sorting}
            subComponent={({ row: { original } }) => (
              <ExpandedMessage
                loadLargeMessage={() =>
                  loadLargeMessage({
                    topicName: props.topic.topicName,
                    messagePartitionID: original.partitionID,
                    offset: original.offset,
                    setMessages,
                    keyDeserializer,
                    valueDeserializer,
                  })
                }
                msg={original}
                onCopyKey={(msg) => onCopyKey(msg, toast)}
                onCopyValue={(msg) => onCopyValue(msg, toast)}
                onDownloadRecord={() => {
                  setDownloadMessages([original]);
                }}
              />
            )}
          />

          {/* Virtual page indicator for infinite scroll mode */}
          {infiniteScrollEnabled && virtualStartIndex > 0 && messages.length > 0 && (
            <Flex align="center" className="text-muted-foreground text-sm" gap={2} justify="center" mt={2}>
              <span>
                Showing messages {virtualStartIndex + 1}-{virtualStartIndex + messages.length}
                {messageSearch?.nextPageToken ? ' (more available)' : ''}
              </span>
              {isLoadingMore && <span className="animate-pulse">Loading...</span>}
            </Flex>
          )}

          {/* Warning when filters are active with infinite scroll */}
          {infiniteScrollEnabled && filters.length > 0 && messages.length > 0 && (
            <Alert mt={4} status="info">
              <AlertIcon />
              <AlertDescription>
                Auto-pagination is disabled when filters are active. Remove filters to enable automatic loading.
              </AlertDescription>
            </Alert>
          )}

          {/* Warning when maxResults is less than page size */}
          {infiniteScrollEnabled && maxResults < pageSize && (
            <Alert mt={4} status="warning">
              <WarningIcon />
              <AlertDescription ml={2}>
                Max Results ({maxResults}) is less than the page size ({pageSize}). Increase Max Results or decrease the
                page size to allow infinite scrolling to fill each page.
              </AlertDescription>
            </Alert>
          )}

          {/* Loading indicator when fetching more pages */}
          {infiniteScrollEnabled && isLoadingMore ? (
            <Flex justifyContent="center" mt={4}>
              <Spinner mr={2} size="sm" />
              <span>Loading more messages...</span>
            </Flex>
          ) : null}

          {/* Indicator when messages are trimmed in infinite scroll mode */}
          {infiniteScrollEnabled && virtualStartIndex > 0 && !isLoadingMore ? (
            <Alert mt={4} status="info">
              <AlertIcon />
              <AlertDescription>
                Showing messages {virtualStartIndex + 1}-{virtualStartIndex + messages.length} of {totalLoadedCount}{' '}
                loaded (oldest trimmed to limit memory to {maxResults} messages).
              </AlertDescription>
            </Alert>
          ) : null}

          <Button
            data-testid="save-messages-button"
            isDisabled={messages.length === 0}
            mt={4}
            onClick={() => {
              setDownloadMessages(messages);
            }}
            variant="outline"
          >
            <span style={{ paddingRight: '4px' }}>
              <DownloadIcon />
            </span>
            Save Messages
          </Button>

          <SaveMessagesDialog
            messages={downloadMessages}
            onClose={() => setDownloadMessages(null)}
            onRequireRawPayload={() => executeMessageSearch()}
          />

          <ColumnSettings
            getShowDialog={() => showColumnSettingsModal}
            setShowDialog={setShowColumnSettingsModal}
            topicName={props.topic.topicName}
          />

          <PreviewFieldsModal
            getShowDialog={() => showPreviewFieldsModal}
            messages={messages}
            setShowDialog={setShowPreviewFieldsModal}
            topicName={props.topic.topicName}
          />

          <DeserializersModal
            getShowDialog={() => showDeserializersModal}
            keyDeserializer={keyDeserializer}
            setKeyDeserializer={setKeyDeserializer}
            setShowDialog={setShowDeserializersModal}
            setValueDeserializer={setValueDeserializer}
            valueDeserializer={valueDeserializer}
          />
        </>
      )}
    </>
  );
};

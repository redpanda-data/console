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

import React, { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  useToast,
} from '@redpanda-data/ui';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  AlertIcon,
  CalendarIcon,
  CodeIcon,
  DownloadIcon,
  ErrorIcon,
  InfoIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PlayIcon,
  RefreshIcon,
  ReplyIcon,
  SettingsIcon,
  SkipBackIcon,
  TabIcon,
  TimerIcon,
} from 'components/icons';
import { Button as RegistryButton } from 'components/redpanda-ui/components/button';
import { DataTablePagination } from 'components/redpanda-ui/components/data-table';
import {
  Select as RegistrySelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from 'components/redpanda-ui/components/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from 'components/redpanda-ui/components/table';
import { Tooltip as RegistryTooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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

/**
 * Pure function for sliding-window trimming of messages.
 * Keeps at most maxResults + pageSize messages in the window,
 * trimming only pages before the user's current view.
 */
function trimSlidingWindow({
  messages,
  maxResults,
  pageSize,
  currentGlobalPage,
  windowStartPage,
  virtualStartIndex,
}: {
  messages: TopicMessage[];
  maxResults: number;
  pageSize: number;
  currentGlobalPage: number;
  windowStartPage: number;
  virtualStartIndex: number;
}): { messages: TopicMessage[]; windowStartPage: number; virtualStartIndex: number; trimCount: number } {
  const maxWindowSize = maxResults + pageSize;

  if (maxResults < pageSize || messages.length <= maxWindowSize) {
    return { messages, windowStartPage, virtualStartIndex, trimCount: 0 };
  }

  const excess = messages.length - maxWindowSize;
  const currentLocalPage = Math.max(0, currentGlobalPage - windowStartPage);

  // Never trim the page the user is currently viewing or the one before it
  const maxPagesToTrim = Math.max(0, currentLocalPage - 1);
  const pagesToTrim = Math.min(Math.floor(excess / pageSize), maxPagesToTrim);
  const trimCount = pagesToTrim * pageSize;

  if (trimCount === 0) {
    return { messages, windowStartPage, virtualStartIndex, trimCount: 0 };
  }

  return {
    messages: messages.slice(trimCount),
    windowStartPage: windowStartPage + pagesToTrim,
    virtualStartIndex: virtualStartIndex + trimCount,
    trimCount,
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: this is because of the refactoring effort, the scope will be minimised eventually
export const TopicMessageView: FC<TopicMessageViewProps> = (props) => {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

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

  // Continuous pagination toggle state
  const [continuousPaginationEnabled, setContinuousPaginationEnabled] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        setSearchParams(props.topic.topicName, { continuousPaginationEnabled: val });
      },
      getDefaultValue: () => getSearchParams(props.topic.topicName)?.continuousPaginationEnabled ?? false,
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

  // Sliding window: the global page number of the first page currently in memory
  const [windowStartPage, setWindowStartPage] = useState(0);
  const windowStartPageRef = useRef(0);
  const [searchPhase, setSearchPhase] = useState<string | null>(null);
  const [bytesConsumed, setBytesConsumed] = useState(0);
  const [totalMessagesConsumed, setTotalMessagesConsumed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const [messageSearch, setMessageSearch] = useState<ReturnType<typeof createMessageSearch> | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showLoadingIndicator, setShowLoadingIndicator] = useState(false);

  useEffect(() => {
    if (isLoadingMore) {
      const timer = setTimeout(() => setShowLoadingIndicator(true), 1000);
      return () => clearTimeout(timer);
    }
    setShowLoadingIndicator(false);
  }, [isLoadingMore]);
  const currentSearchRunRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const prevStartOffsetRef = useRef<number>(startOffset);
  const prevMaxResultsRef = useRef<number>(maxResults);
  const prevPageIndexRef = useRef<number>(pageIndex);
  const [forceRefresh, setForceRefresh] = useState(0);

  const currentMessageSearchRef = useRef<ReturnType<typeof createMessageSearch> | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const [loadMoreFailures, setLoadMoreFailures] = useState(0);
  const isMountedRef = useRef(true);
  const MAX_LOAD_MORE_RETRIES = 3;
  const lastLoadMoreRef = useRef<{ pageIndex: number; total: number }>({ pageIndex: -1, total: -1 });
  const pageIndexRef = useRef(pageIndex);

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

  // For continuous pagination, just use the filtered messages directly
  // We don't use placeholders as they cause page content to shift
  const filteredMessages =
    continuousPaginationEnabled && startOffset === PartitionOffsetOrigin.EndMinusResults
      ? [...baseFilteredMessages].sort((a, b) => b.timestamp - a.timestamp)
      : baseFilteredMessages;

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

  // Keep windowStartPageRef in sync
  useEffect(() => {
    windowStartPageRef.current = windowStartPage;
  }, [windowStartPage]);

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

      // Calculate backend page size: for continuous pagination mode,
      // initial load fetches maxResults at once, subsequent loadMore calls use smaller pageSize.
      // We send maxResults as pageSize to enable pagination mode in the backend.
      const backendPageSize = continuousPaginationEnabled ? maxResults : undefined;
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
        setWindowStartPage(0);
        windowStartPageRef.current = 0;
        if (maxResults < pageSize) {
          lastLoadMoreRef.current = { pageIndex: 0, total: result.length };
        }
        setSearchPhase(null);
        setElapsedMs(endTime - startTime);
        setBytesConsumed(search.bytesConsumed);
        setTotalMessagesConsumed(search.totalMessagesConsumed);

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
      continuousPaginationEnabled,
      pageSize,
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
      setWindowStartPage(0);
      windowStartPageRef.current = 0;
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

  // Auto-load more messages when user reaches beyond loaded messages (continuous pagination mode only)
  useEffect(() => {
    if (
      !continuousPaginationEnabled ||
      filters.length > 0 ||
      !messageSearch ||
      !messageSearch.nextPageToken ||
      isLoadingMore ||
      searchPhase ||
      loadMoreFailures >= MAX_LOAD_MORE_RETRIES
    ) {
      return;
    }

    // Compute window-local page position; lastLoadMoreRef uses global pageIndex to deduplicate across window shifts
    const localPage = Math.max(0, pageIndex - windowStartPageRef.current);
    const messagesNeededForPage = (localPage + 1) * pageSize;

    const totalLoadedPages = Math.ceil(messages.length / pageSize);
    const isOnLastPage = localPage === totalLoadedPages - 1;

    const totalVirtualMessages = virtualStartIndexRef.current + messages.length;
    const needsMoreForCurrentPage = messagesNeededForPage > messages.length;
    const isNewPageOrTotalChanged =
      lastLoadMoreRef.current.pageIndex !== pageIndex || lastLoadMoreRef.current.total < totalVirtualMessages;
    const needsMoreMessages = needsMoreForCurrentPage || (isOnLastPage && isNewPageOrTotalChanged);

    if (needsMoreMessages) {
      // Prevent duplicate loads from effect re-runs
      lastLoadMoreRef.current = { pageIndex, total: totalVirtualMessages };

      const abortController = new AbortController();
      loadMoreAbortRef.current = abortController;
      const capturedMessageSearch = messageSearch;

      setIsLoadingMore(true);
      capturedMessageSearch
        .loadMore(maxResults)
        .then(() => {
          if (currentMessageSearchRef.current !== capturedMessageSearch) {
            return;
          }

          const allMessages = capturedMessageSearch.messages;
          setTotalLoadedCount(allMessages.length);

          const trimResult = trimSlidingWindow({
            messages: [...allMessages],
            maxResults,
            pageSize,
            currentGlobalPage: pageIndexRef.current,
            windowStartPage: windowStartPageRef.current,
            virtualStartIndex: virtualStartIndexRef.current,
          });

          // Free memory from the MobX observable array
          if (trimResult.trimCount > 0) {
            capturedMessageSearch.messages.splice(0, trimResult.trimCount);
          }

          // Update refs BEFORE setting state to prevent cascading
          windowStartPageRef.current = trimResult.windowStartPage;
          virtualStartIndexRef.current = trimResult.virtualStartIndex;
          lastLoadMoreRef.current = {
            pageIndex: pageIndexRef.current,
            total: trimResult.virtualStartIndex + trimResult.messages.length,
          };

          setWindowStartPage(trimResult.windowStartPage);
          setVirtualStartIndex(trimResult.virtualStartIndex);
          setMessages(trimResult.messages);
          setLoadMoreFailures(0);
        })
        .catch((err) => {
          if (isMountedRef.current && !abortController.signal.aborted) {
            setLoadMoreFailures((prev) => prev + 1);
            toastRef.current({
              title: 'Failed to load more messages',
              description: (err as Error).message,
              status: 'error',
              duration: 5000,
              isClosable: true,
            });
          }
        })
        .finally(() => {
          setIsLoadingMore(false);
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
    // Note: virtualStartIndex intentionally excluded — the effect reads it via ref
  }, [
    pageIndex,
    continuousPaginationEnabled,
    maxResults,
    filters.length,
    messageSearch,
    isLoadingMore,
    searchPhase,
    messages.length,
    pageSize,
    loadMoreFailures,
  ]);

  // Reset pagination when navigating back to page 1 in continuous pagination mode
  // This prevents keeping many pages in memory and triggering excessive requests
  useEffect(() => {
    // Check if we're in continuous pagination mode and user navigated back to page 1 from a higher page
    // Use ref to check messageSearch existence to avoid circular dependency
    if (
      continuousPaginationEnabled &&
      pageIndex === 0 &&
      prevPageIndexRef.current > 1 &&
      currentMessageSearchRef.current
    ) {
      // Clear the message search and state
      setMessages([]);
      setMessageSearch(null);
      // Reset failure count when resetting pagination
      setLoadMoreFailures(0);
      // Reset total loaded count
      setTotalLoadedCount(0);
      // Reset virtual start index for sliding window
      setVirtualStartIndex(0);
      // Reset window start page for sliding window
      setWindowStartPage(0);
      windowStartPageRef.current = 0;
      // Reset last loadMore page tracking
      lastLoadMoreRef.current = { pageIndex: -1, total: -1 };
      // Clear the search run ref and trigger a forced refresh
      currentSearchRunRef.current = null;
      setForceRefresh((prev) => prev + 1);
    }
    prevPageIndexRef.current = pageIndex;
    // Note: messageSearch intentionally excluded to avoid circular dependency
    // We use currentMessageSearchRef.current instead which is always in sync
  }, [pageIndex, continuousPaginationEnabled]);

  // Message Table rendering variables and functions
  // Map global pageIndex to a window-local page index for the DataTable.
  // windowStartPage is the global page number of the first page in our sliding window.
  const localPageIndex = continuousPaginationEnabled ? Math.max(0, pageIndex - windowStartPage) : pageIndex;

  const loadedPages = Math.ceil(filteredMessages.length / pageSize);
  const hasMoreData = continuousPaginationEnabled && messageSearch?.nextPageToken;
  const totalPages = Math.max(1, hasMoreData ? loadedPages + 1 : loadedPages);
  const boundedLocalPageIndex = Math.min(localPageIndex, totalPages - 1);
  const isOnUnloadedPage = boundedLocalPageIndex >= loadedPages && hasMoreData;

  const paginationParams = {
    pageIndex: isOnUnloadedPage ? loadedPages - 1 : boundedLocalPageIndex,
    pageSize: continuousPaginationEnabled && maxResults < pageSize ? maxResults : pageSize,
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
      enableSorting: !continuousPaginationEnabled, // Disable sorting in continuous pagination mode
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
      enableSorting: !continuousPaginationEnabled, // Disable sorting in continuous pagination mode
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
      enableSorting: !continuousPaginationEnabled, // Disable sorting in continuous pagination mode
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

  const expanderColumn: ColumnDef<TopicMessage> = {
    id: 'expander',
    size: 40,
    enableSorting: false,
    cell: ({ row }) =>
      row.getCanExpand() ? (
        <RegistryButton
          aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
          onClick={row.getToggleExpandedHandler()}
          size="icon-xs"
          variant="ghost"
        >
          {row.getIsExpanded() ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </RegistryButton>
      ) : null,
  };

  const table = useReactTable({
    data: filteredMessages,
    columns: [expanderColumn, ...columns],
    state: {
      pagination: paginationParams,
      sorting,
    },
    onPaginationChange: (updater) => {
      const newState = typeof updater === 'function' ? updater(paginationParams) : updater;
      uiState.topicSettings.searchParams.pageSize = newState.pageSize;
      if (continuousPaginationEnabled) {
        setPageIndex(windowStartPage + newState.pageIndex);
      } else {
        setPageIndex(newState.pageIndex);
      }
      setPageSize(newState.pageSize);
    },
    onSortingChange: (updater) => {
      if (continuousPaginationEnabled) {
        return;
      }
      const newSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSortingState(newSorting);
    },
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    getRowCanExpand: () => true,
    autoResetPageIndex: false,
  });

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
            {continuousPaginationEnabled ? 'Newest' : `Newest - ${String(maxResults)}`}
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

  const continuousPaginationDisabled =
    currentOffsetOrigin !== PartitionOffsetOrigin.EndMinusResults &&
    currentOffsetOrigin !== PartitionOffsetOrigin.Start;

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

                  // Auto-disable continuous pagination for unsupported offsets
                  if (
                    continuousPaginationEnabled &&
                    e !== PartitionOffsetOrigin.EndMinusResults &&
                    e !== PartitionOffsetOrigin.Start
                  ) {
                    setContinuousPaginationEnabled(false);
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
              data-testid="max-results-select"
              onChange={(c) => {
                setMaxResults(c);
              }}
              options={[...[1, 3, 5, 10, 20, 50, 100, 200, 500, 1000, 10_000].map((i) => ({ value: i }))]}
              value={maxResults}
            />
          </Label>

          <Label
            style={{}}
            text="Continuous Pagination"
            textSuffix={
              <RegistryTooltip>
                <TooltipTrigger asChild>
                  <span style={{ display: 'inline-flex', verticalAlign: 'text-top', cursor: 'pointer' }}>
                    <InfoIcon size={11} />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {continuousPaginationDisabled
                    ? 'Continuous pagination is only available with Newest or Beginning start offsets'
                    : 'Continuously load more messages as you page forward through the topic. Only the most recent pages are kept in memory.'}
                </TooltipContent>
              </RegistryTooltip>
            }
          >
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <Switch
                data-testid="continuous-pagination-toggle"
                isChecked={continuousPaginationEnabled}
                isDisabled={continuousPaginationDisabled}
                onChange={(e) => setContinuousPaginationEnabled(e.target.checked)}
              />
            </div>
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
              fillFactor={continuousPaginationEnabled ? 0 : messages.length / maxResults}
              identityKey="messageSearch"
              messagesConsumed={String(totalMessagesConsumed)}
              progressText={
                continuousPaginationEnabled && totalLoadedCount > messages.length
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
          <div data-testid="messages-table">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead
                        className={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                        key={header.id}
                        onClick={header.column.getToggleSortingHandler()}
                        style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && ' ↑'}
                        {header.column.getIsSorted() === 'desc' && ' ↓'}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {(() => {
                  if (searchPhase !== null && filteredMessages.length === 0) {
                    return (
                      <TableRow>
                        <TableCell className="py-10 text-center" colSpan={table.getVisibleFlatColumns().length}>
                          <Spinner size="md" />
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (filteredMessages.length === 0) {
                    return (
                      <TableRow>
                        <TableCell
                          className="py-10 text-center text-muted-foreground"
                          colSpan={table.getVisibleFlatColumns().length}
                        >
                          No messages
                        </TableCell>
                      </TableRow>
                    );
                  }
                  return table.getRowModel().rows.map((row) => (
                    <React.Fragment key={row.id}>
                      <TableRow>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell
                            key={cell.id}
                            style={{ width: cell.column.getSize() !== 150 ? cell.column.getSize() : undefined }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                      {row.getIsExpanded() && (
                        <TableRow>
                          <TableCell className="p-0" colSpan={row.getVisibleCells().length}>
                            <ExpandedMessage
                              loadLargeMessage={() =>
                                loadLargeMessage({
                                  topicName: props.topic.topicName,
                                  messagePartitionID: row.original.partitionID,
                                  offset: row.original.offset,
                                  setMessages,
                                  keyDeserializer,
                                  valueDeserializer,
                                })
                              }
                              msg={row.original}
                              onCopyKey={(msg) => onCopyKey(msg, toast)}
                              onCopyValue={(msg) => onCopyValue(msg, toast)}
                              onDownloadRecord={() => {
                                setDownloadMessages([row.original]);
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ));
                })()}
              </TableBody>
            </Table>
          </div>

          {/* Normal pagination */}
          {!continuousPaginationEnabled && filteredMessages.length > 0 && (
            <div className="pt-2">
              <DataTablePagination table={table} />
            </div>
          )}

          {/* Infinite scroll pagination */}
          {continuousPaginationEnabled && filteredMessages.length > 0 && (
            <div className="flex items-center justify-end px-2 py-2">
              <div className="flex items-center space-x-6 lg:space-x-8">
                {/* Page counter */}
                <div className="flex w-[100px] items-center justify-center font-medium text-sm">
                  Page {pageIndex + 1}
                  {hasMoreData ? '' : ` of ${windowStartPage + loadedPages}`}
                </div>

                {/* Rows per page selector */}
                <div className="flex items-center space-x-2">
                  <p className="font-medium text-sm">Rows per page</p>
                  <RegistrySelect
                    onValueChange={(value) => {
                      const newSize = Number(value);
                      uiState.topicSettings.searchParams.pageSize = newSize;
                      setPageSize(newSize);
                    }}
                    value={`${pageSize}`}
                  >
                    <SelectTrigger className="h-8 w-[70px]">
                      <SelectValue placeholder={pageSize} />
                    </SelectTrigger>
                    <SelectContent side="top">
                      {[10, 20, 25, 30, 40, 50].map((size) => (
                        <SelectItem key={size} value={`${size}`}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RegistrySelect>
                </div>

                {/* Navigation buttons */}
                <div className="flex items-center space-x-2">
                  <RegistryButton
                    className="hidden size-8 lg:flex"
                    disabled={pageIndex === 0}
                    onClick={() => setPageIndex(0)}
                    size="icon"
                    variant="outline"
                  >
                    <span className="sr-only">Go to first page</span>
                    <ChevronsLeft />
                  </RegistryButton>

                  <RegistryButton
                    className="size-8"
                    disabled={localPageIndex === 0}
                    onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
                    size="icon"
                    variant="outline"
                  >
                    <span className="sr-only">Go to previous page</span>
                    <ChevronLeft />
                  </RegistryButton>

                  <RegistryButton
                    className="size-8"
                    disabled={boundedLocalPageIndex >= loadedPages - 1 && !hasMoreData}
                    onClick={() => setPageIndex(pageIndex + 1)}
                    size="icon"
                    variant="outline"
                  >
                    <span className="sr-only">Go to next page</span>
                    <ChevronRight />
                  </RegistryButton>

                  <RegistryButton className="hidden size-8 lg:flex" disabled size="icon" variant="outline">
                    <span className="sr-only">Go to last page</span>
                    <ChevronsRight />
                  </RegistryButton>
                </div>
              </div>
            </div>
          )}

          {/* Virtual page indicator for continuous pagination mode */}
          {continuousPaginationEnabled && messages.length > 0 && (
            <Flex align="center" className="text-muted-foreground text-sm" gap={2} justify="center" mt={2}>
              <span>
                Loaded messages {virtualStartIndex + 1}-{virtualStartIndex + messages.length}
                {` (pages ${windowStartPage + 1}–${windowStartPage + loadedPages} in memory)`}
                {messageSearch?.nextPageToken ? ' · more available' : ''}
              </span>
            </Flex>
          )}

          {/* Warning when filters are active with continuous pagination */}
          {continuousPaginationEnabled && filters.length > 0 && messages.length > 0 && (
            <Alert mt={4} status="info">
              <AlertIcon />
              <AlertDescription>
                Auto-pagination is disabled when filters are active. Remove filters to enable automatic loading.
              </AlertDescription>
            </Alert>
          )}

          {/* Loading indicator when fetching more pages */}
          <div
            className={`mt-4 flex h-6 items-center justify-center ${continuousPaginationEnabled && showLoadingIndicator ? 'visible' : 'invisible'}`}
          >
            <Spinner mr={2} size="sm" />
            <span>Loading more messages...</span>
          </div>

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

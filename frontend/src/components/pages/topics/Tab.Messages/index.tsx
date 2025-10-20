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

import { DownloadIcon, KebabHorizontalIcon, SyncIcon, XCircleIcon } from '@primer/octicons-react';
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
  AlertIcon,
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
  Tooltip,
  useBreakpoint,
  useToast,
} from '@redpanda-data/ui';
import type { ColumnDef } from '@tanstack/react-table';
import { observer } from 'mobx-react';
import { parseAsInteger, parseAsString, useQueryState } from 'nuqs';
import {
  MdCalendarToday,
  MdDownload,
  MdJavascript,
  MdKeyboardTab,
  MdOutlineLayers,
  MdOutlinePlayCircle,
  MdOutlineQuickreply,
  MdOutlineSettings,
  MdOutlineSkipPrevious,
  MdOutlineTimer,
} from 'react-icons/md';

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
import { IsDev } from '../../../../utils/env';
import { sanitizeString, wrapFilterFragment } from '../../../../utils/filter-helper';
import { onPaginationChange } from '../../../../utils/pagination';
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
  if (value == null) {
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

async function loadLargeMessage(
  topicName: string,
  messagePartitionID: number,
  offset: number,
  setMessages: React.Dispatch<React.SetStateAction<TopicMessage[]>>
) {
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
    keyDeserializer: uiState.topicSettings.searchParams.keyDeserializer,
    valueDeserializer: uiState.topicSettings.searchParams.valueDeserializer,
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
export const TopicMessageView: FC<TopicMessageViewProps> = observer((props) => {
  const toast = useToast();
  const breakpoint = useBreakpoint({ ssr: false });

  // URL query state management with localStorage sync
  const [partitionID, setPartitionID] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        uiState.topicSettings.searchParams.partitionID = val;
      },
      getDefaultValue: () => uiState.topicSettings.searchParams.partitionID,
    },
    'p',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.partitionID)
  );

  const [maxResults, setMaxResults] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        uiState.topicSettings.searchParams.maxResults = val;
      },
      getDefaultValue: () => uiState.topicSettings.searchParams.maxResults,
    },
    's',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.maxResults)
  );

  const [startOffset, setStartOffset] = useQueryStateWithCallback<number>(
    {
      onUpdate: (val) => {
        uiState.topicSettings.searchParams.startOffset = val;
      },
      getDefaultValue: () => uiState.topicSettings.searchParams.startOffset,
    },
    'o',
    parseAsInteger.withDefault(DEFAULT_SEARCH_PARAMS.startOffset)
  );

  const [quickSearch, setQuickSearch] = useQueryState('q', parseAsString.withDefault(''));

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
        uiState.topicSettings.searchParams.pageSize = val;
      },
      getDefaultValue: () => uiState.topicSettings.searchParams.pageSize,
    },
    'pageSize',
    parseAsInteger.withDefault(50)
  );

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
  const [searchPhase, setSearchPhase] = useState<string | null>(null);
  const [bytesConsumed, setBytesConsumed] = useState(0);
  const [totalMessagesConsumed, setTotalMessagesConsumed] = useState(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const currentSearchRunRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Filter messages based on quick search
  const filteredMessages = quickSearch
    ? messages.filter((m) => {
        const searchStr = quickSearch.toLowerCase();
        return (
          m.offset.toString().toLowerCase().includes(searchStr) ||
          m.keyJson?.toLowerCase().includes(searchStr) ||
          m.valueJson?.toLowerCase().includes(searchStr)
        );
      })
    : messages;

  // Convert @computed activePreviewTags to useMemo
  const activePreviewTags = useMemo(() => uiState.topicSettings.previewTags.filter((t) => t.isActive), []);

  // Cleanup effect (replaces componentWillUnmount)
  useEffect(
    () => () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      appGlobal.searchMessagesFunc = undefined;
    },
    []
  );

  // Convert executeMessageSearch to useCallback
  const executeMessageSearch = useCallback(async (): Promise<TopicMessage[]> => {
    const canUseFilters =
      (api.topicPermissions.get(props.topic.topicName)?.canUseSearchFilters ?? true) && !isServerless();

    let filterCode = '';
    if (canUseFilters) {
      const functionNames: string[] = [];
      const functions: string[] = [];

      const filteredSearchParams = uiState.topicSettings.searchParams.filters.filter(
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

    const request = {
      topicName: props.topic.topicName,
      partitionId: partitionID,
      startOffset,
      startTimestamp: uiState.topicSettings.searchParams.startTimestamp,
      maxResults,
      filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
      includeRawPayload: true,
      keyDeserializer: uiState.topicSettings.searchParams.keyDeserializer,
      valueDeserializer: uiState.topicSettings.searchParams.valueDeserializer,
    } as MessageSearchRequest;

    try {
      setFetchError(null);
      setSearchPhase('Searching...');

      const messageSearch = createMessageSearch();
      const startTime = Date.now();

      const result = await messageSearch.startSearch(request).catch((err: Error) => {
        const msg = err.message ?? String(err);
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(`error in searchTopicMessages: ${msg}`);
        setFetchError(err);
        setSearchPhase(null);
        return [];
      });

      const endTime = Date.now();
      setMessages(result);
      setSearchPhase(null);
      setElapsedMs(endTime - startTime);
      setBytesConsumed(messageSearch.bytesConsumed);
      setTotalMessagesConsumed(messageSearch.totalMessagesConsumed);

      return result;
    } catch (error: unknown) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`error in searchTopicMessages: ${(error as Error).message ?? String(error)}`);
      setFetchError(error as Error);
      setSearchPhase(null);
      return [];
    }
  }, [props.topic.topicName, partitionID, startOffset, maxResults]);

  // Convert searchFunc to useCallback
  const searchFunc = useCallback(
    (source: 'auto' | 'manual') => {
      // Create search params signature
      const searchParams = `${startOffset} ${maxResults} ${partitionID} ${uiState.topicSettings.searchParams.startTimestamp} ${uiState.topicSettings.searchParams.keyDeserializer} ${uiState.topicSettings.searchParams.valueDeserializer}`;

      if (searchParams === currentSearchRunRef.current && source === 'auto') {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.log('ignoring search, search params are up to date, and source is auto', {
          newParams: searchParams,
          oldParams: currentSearchRunRef.current,
          trigger: source,
        });
        return;
      }

      // Abort current search if one is running
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.log('starting a new message search', {
        newParams: searchParams,
        oldParams: currentSearchRunRef.current,
        trigger: source,
      });

      // Start new search
      currentSearchRunRef.current = searchParams;
      abortControllerRef.current = new AbortController();

      try {
        executeMessageSearch()
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
    [startOffset, maxResults, partitionID, executeMessageSearch]
  );

  // Auto search when parameters change
  useEffect(() => {
    // Set up auto-search with 100ms delay
    const timer = setTimeout(() => {
      searchFunc('auto');
    }, 100);

    appGlobal.searchMessagesFunc = searchFunc;

    return () => clearTimeout(timer);
  }, [searchFunc]);

  // Message Table rendering variables and functions
  const paginationParams = {
    pageIndex,
    pageSize,
  };

  const tsFormat = uiState.topicSettings.previewTimestamps;
  const hasKeyTags = uiState.topicSettings.previewTags.count((x) => x.isActive && x.searchInMessageKey) > 0;

  const isValueDeserializerActive =
    uiState.topicSettings.searchParams.valueDeserializer !== null &&
    uiState.topicSettings.searchParams.valueDeserializer !== undefined &&
    uiState.topicSettings.searchParams.valueDeserializer !== PayloadEncoding.UNSPECIFIED;
  const isKeyDeserializerActive =
    uiState.topicSettings.searchParams.keyDeserializer !== null &&
    uiState.topicSettings.searchParams.keyDeserializer !== undefined &&
    uiState.topicSettings.searchParams.keyDeserializer !== PayloadEncoding.UNSPECIFIED;

  const dataTableColumns: Record<DataColumnKey, ColumnDef<TopicMessage>> = {
    offset: {
      header: 'Offset',
      accessorKey: 'offset',
      cell: ({
        row: {
          original: { offset },
        },
      }) => numberToThousandsString(offset),
    },
    partitionID: {
      header: 'Partition',
      accessorKey: 'partitionID',
    },
    timestamp: {
      header: 'Timestamp',
      accessorKey: 'timestamp',
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
              <Badge>Deserializer: {PAYLOAD_ENCODING_LABELS[uiState.topicSettings.searchParams.keyDeserializer]}</Badge>
            </button>
          </Flex>
        ) : (
          'Key'
        ),
      size: hasKeyTags ? 300 : 1,
      accessorKey: 'key',
      cell: ({ row: { original } }) => <MessageKeyPreview msg={original} previewFields={() => activePreviewTags} />,
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
              <Badge>
                Deserializer: {PAYLOAD_ENCODING_LABELS[uiState.topicSettings.searchParams.valueDeserializer]}
              </Badge>
            </button>
          </Flex>
        ) : (
          'Value'
        ),
      accessorKey: 'value',
      cell: ({ row: { original } }) => (
        <MessagePreview
          isCompactTopic={props.topic.cleanupPolicy.includes('compact')}
          msg={original}
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

  if (uiState.topicSettings.previewColumnFields.length > 0) {
    newColumns.splice(0, newColumns.length);

    // let's be defensive and remove any duplicates before showing in the table
    const selectedColumns = new Set(uiState.topicSettings.previewColumnFields.map((field) => field.dataIndex));

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
            <KebabHorizontalIcon />
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
          <MdOutlinePlayCircle />
          <span data-testid="start-offset-latest-live">Latest / Live</span>
        </Flex>
      ),
    },
    {
      value: PartitionOffsetOrigin.EndMinusResults,
      label: (
        <Flex alignItems="center" gap={2}>
          <MdOutlineQuickreply />
          <span data-testid="start-offset-newest">{`Newest - ${String(maxResults)}`}</span>
        </Flex>
      ),
    },
    {
      value: PartitionOffsetOrigin.Start,
      label: (
        <Flex alignItems="center" gap={2}>
          <MdOutlineSkipPrevious />
          <span data-testid="start-offset-beginning">Beginning</span>
        </Flex>
      ),
    },
    {
      value: PartitionOffsetOrigin.Custom,
      label: (
        <Flex alignItems="center" gap={2}>
          <MdKeyboardTab />
          <span data-testid="start-offset-custom">Offset</span>
        </Flex>
      ),
    },
    {
      value: PartitionOffsetOrigin.Timestamp,
      label: (
        <Flex alignItems="center" gap={2}>
          <MdCalendarToday />
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
              {currentOffsetOrigin === PartitionOffsetOrigin.Timestamp && <StartOffsetDateTimePicker />}
            </Flex>
          </Label>

          <Label text="Max Results">
            <SingleSelect<number>
              onChange={(c) => {
                setMaxResults(c);
              }}
              options={[1, 3, 5, 10, 20, 50, 100, 200, 500].map((i) => ({ value: i }))}
              value={maxResults}
            />
          </Label>

          {uiState.topicSettings.dynamicFilters.map(
            (filter) =>
              ({
                partition: (
                  <Label text="Partition">
                    <RemovableFilter
                      onRemove={() => {
                        uiState.topicSettings.dynamicFilters.remove('partition');
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
                  icon={<MdOutlineLayers size="1.5rem" />}
                  isDisabled={uiState.topicSettings.dynamicFilters.includes('partition')}
                  onClick={() => uiState.topicSettings.dynamicFilters.pushDistinct('partition')}
                >
                  Partition
                </MenuItem>
                <MenuDivider />
                <MenuItem
                  data-testid="add-topic-filter-javascript"
                  icon={<MdJavascript size="1.5rem" />}
                  isDisabled={!canUseFilters}
                  onClick={() => {
                    const filter = new FilterEntry();
                    filter.isNew = true;
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
              fillFactor={messages.length / maxResults}
              identityKey="messageSearch"
              messagesConsumed={String(totalMessagesConsumed)}
              progressText={`${messages.length} / ${maxResults}`}
              // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
              statusText={searchPhase!}
            />
          )}
        </GridItem>

        <GridItem alignItems="flex-end" display="flex" gap={3} justifyContent="flex-end">
          <Menu>
            <MenuButton as={IconButton} icon={<MdOutlineSettings size="1.5rem" />} variant="outline" />
            <MenuList>
              <MenuItem
                onClick={() => {
                  setShowDeserializersModal(true);
                }}
              >
                Deserialization
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setShowColumnSettingsModal(true);
                }}
              >
                Column settings
              </MenuItem>
              <MenuItem
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
            {searchPhase == null && (
              <Tooltip hasArrow label="Repeat current search" placement="top">
                <IconButton
                  aria-label="Repeat current search"
                  icon={<SyncIcon />}
                  onClick={() => searchFunc('manual')}
                  variant="outline"
                />
              </Tooltip>
            )}
            {searchPhase != null && (
              <Tooltip hasArrow label="Stop searching" placement="top">
                <IconButton
                  aria-label="Stop searching"
                  colorScheme="red"
                  icon={<XCircleIcon />}
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
          onEdit={(filter) => {
            setCurrentJSFilter(filter);
          }}
        />

        <GridItem display="flex" gap={4} gridColumn="1/-1" mt={4}>
          {/* Quick Search */}
          <Input
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
                  <MdDownload size={14} /> {prettyBytes(bytesConsumed)}
                </Flex>
                <Flex alignItems="center" gap={2}>
                  <MdOutlineTimer size={14} /> {elapsedMs ? prettyMilliseconds(elapsedMs) : ''}
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

      {currentJSFilter && (
        <JavascriptFilterModal
          currentFilter={currentJSFilter}
          onClose={() => setCurrentJSFilter(null)}
          onSave={(filter) => {
            if (filter.isNew) {
              uiState.topicSettings.searchParams.filters.push(filter);
              filter.isNew = false;
            } else {
              const idx = uiState.topicSettings.searchParams.filters.findIndex((x) => x.id === filter.id);
              if (idx !== -1) {
                uiState.topicSettings.searchParams.filters.splice(idx, 1, filter);
              }
            }
            searchFunc('manual');
          }}
        />
      )}

      {/* Message Table (or error display) */}
      {fetchError ? (
        <Alert status="error">
          <AlertIcon alignSelf="flex-start" />
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
            // we need (?? []) to be compatible with searchParams of clients already stored in local storage
            // otherwise we would get undefined for some of the existing ones
            onSortingChange={(sorting) => {
              uiState.topicSettings.searchParams.sorting =
                typeof sorting === 'function' ? sorting(uiState.topicSettings.searchParams.sorting) : sorting;
            }}
            pagination={paginationParams}
            size={['lg', 'md', 'sm'].includes(breakpoint) ? 'sm' : 'md'}
            sorting={uiState.topicSettings.searchParams.sorting ?? []}
            subComponent={({ row: { original } }) => (
              <ExpandedMessage
                loadLargeMessage={() =>
                  loadLargeMessage(props.topic.topicName, original.partitionID, original.offset, setMessages)
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
          <Button
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

          <ColumnSettings getShowDialog={() => showColumnSettingsModal} setShowDialog={setShowColumnSettingsModal} />

          <PreviewFieldsModal
            getShowDialog={() => showPreviewFieldsModal}
            messages={messages}
            setShowDialog={setShowPreviewFieldsModal}
          />

          <DeserializersModal getShowDialog={() => showDeserializersModal} setShowDialog={setShowDeserializersModal} />
        </>
      )}
    </>
  );
});

/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { DownloadIcon, KebabHorizontalIcon, SkipIcon, SyncIcon, XCircleIcon } from '@primer/octicons-react';
import {
  action,
  autorun,
  computed,
  type IReactionDisposer,
  makeObservable,
  observable,
  transaction,
  untracked,
} from 'mobx';
import { observer } from 'mobx-react';
import React, { Component, type FC, type ReactNode, useState } from 'react';

import { api, createMessageSearch, type MessageSearch, type MessageSearchRequest } from '../../../../state/backend-api';
import type { Payload, Topic, TopicAction, TopicMessage } from '../../../../state/rest-interfaces';
import { Feature, isSupported } from '../../../../state/supported-features';
import {
  type ColumnList,
  createFilterEntry,
  type DataColumnKey,
  DEFAULT_SEARCH_PARAMS,
  type FilterEntry,
  PartitionOffsetOrigin,
  type PartitionOffsetOriginType,
  type PreviewTagV2,
  type TimestampDisplayFormat,
} from '../../../../state/ui';
import { uiState } from '../../../../state/ui-state';
import '../../../../utils/array-extensions';
import { InfoIcon, WarningIcon } from '@chakra-ui/icons';
import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Badge,
  Box,
  Button,
  Checkbox,
  DataTable,
  DateTimeInput,
  Flex,
  Grid,
  GridItem,
  Heading,
  IconButton,
  Input,
  Link,
  Menu,
  MenuButton,
  MenuDivider,
  MenuItem,
  MenuList,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  RadioGroup,
  Tabs as RpTabs,
  Stack,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Tooltip,
  useBreakpoint,
  useColorModeValue,
  useToast,
} from '@redpanda-data/ui';
import type { ColumnDef } from '@tanstack/react-table';
import {
  MdCalendarToday,
  MdDoNotDisturb,
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
import { Link as ReactRouterLink } from 'react-router-dom';

import JavascriptFilterModal from './javascript-filter-modal';
import { getPreviewTags, PreviewSettings } from './preview-settings';
import { isServerless } from '../../../../config';
import { useFilterableData } from '../../../../hooks/use-filterable-data';
import usePaginationParams from '../../../../hooks/use-pagination-params';
import { PayloadEncoding } from '../../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import { appGlobal } from '../../../../state/app-global';
import { IsDev } from '../../../../utils/env';
import { sanitizeString, wrapFilterFragment } from '../../../../utils/filter-helper';
import { toJson } from '../../../../utils/json-utils';
import { onPaginationChange } from '../../../../utils/pagination';
import { editQuery } from '../../../../utils/query-helper';
import {
  Ellipsis,
  Label,
  navigatorClipboardErrorHandler,
  numberToThousandsString,
  StatusIndicator,
  TimestampDisplay,
  toSafeString,
} from '../../../../utils/tsx-utils';
import {
  base64FromUInt8Array,
  cullText,
  encodeBase64,
  prettyBytes,
  prettyMilliseconds,
  titleCase,
} from '../../../../utils/utils';
import { range } from '../../../misc/common';
import { KowlJsonView } from '../../../misc/kowl-json-view';
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

// Add these type definitions and helper functions at the top of the file
type TopicMessageParams = {
  partitionID: number;
  maxResults: number;
  startOffset: number;
  quickSearch: string;
};

type ParamConfig = {
  key: keyof TopicMessageParams;
  transform: (value: string) => number | string;
};

const PARAM_MAPPING = {
  p: { key: 'partitionID', transform: Number } as ParamConfig,
  s: { key: 'maxResults', transform: Number } as ParamConfig,
  o: { key: 'startOffset', transform: Number } as ParamConfig,
  q: { key: 'quickSearch', transform: String } as ParamConfig,
};

// Define the column order as a constant
const COLUMN_ORDER: DataColumnKey[] = ['timestamp', 'partitionID', 'offset', 'key', 'value', 'keySize', 'valueSize'];

// Regex for checking printable ASCII characters
const PRINTABLE_CHAR_REGEX = /[\x20-\x7E]/;

function parseUrlParams(): TopicMessageParams {
  const query = new URLSearchParams(window.location.search);
  const params = { ...DEFAULT_SEARCH_PARAMS };

  // First apply defaults from local storage (last used params)
  const lastUsedParams = uiState.topicSettings.searchParams;
  params.partitionID = lastUsedParams.partitionID;
  params.maxResults = lastUsedParams.maxResults;
  params.startOffset = lastUsedParams.startOffset;
  // Initialize quickSearch as empty string instead of loading from local storage
  params.quickSearch = '';

  // Then override with URL parameters if they exist
  for (const [urlParam, { key, transform }] of Object.entries(PARAM_MAPPING)) {
    const value = query.get(urlParam);
    if (value !== null) {
      const transformed = transform(value);
      if (key === 'startOffset') {
        const numValue = Number(transformed);
        params[key] = Number.isNaN(numValue) ? lastUsedParams.startOffset : numValue;
      } else if (key === 'quickSearch') {
        params[key] = transformed as string;
      } else {
        params[key] = transformed as number;
      }
    }
  }

  return params;
}

function updateUrlParams(params: Partial<TopicMessageParams>) {
  editQuery((query: Record<string, string | null | undefined>) => {
    for (const [urlParam, { key }] of Object.entries(PARAM_MAPPING)) {
      const value = params[key as keyof TopicMessageParams];
      if (value !== undefined && value !== null) {
        query[urlParam] = String(value);
      }
    }
  });

  // Update local storage with the new params
  if (params.partitionID !== undefined) {
    uiState.topicSettings.searchParams.partitionID = params.partitionID;
  }
  if (params.maxResults !== undefined) {
    uiState.topicSettings.searchParams.maxResults = params.maxResults;
  }
  if (params.startOffset !== undefined) {
    uiState.topicSettings.searchParams.startOffset = params.startOffset;
  }
  if (params.quickSearch !== undefined) {
    uiState.topicSettings.quickSearch = params.quickSearch;
  }
}

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

@observer
export class TopicMessageView extends Component<TopicMessageViewProps> {
  @observable previewDisplay: string[] = [];
  @observable currentParams: TopicMessageParams;

  @observable showColumnSettingsModal = false;
  @observable showPreviewFieldsModal = false;
  @observable showDeserializersModal = false;

  @observable fetchError = null as Error | null;

  messageSearch = createMessageSearch();

  autoSearchReaction: IReactionDisposer | null = null;
  quickSearchReaction: IReactionDisposer | null = null;
  urlParamsReaction: IReactionDisposer | null = null;

  currentSearchRun: string | null = null;

  @observable downloadMessages: TopicMessage[] | null = null;
  @observable expandedKeys: React.Key[] = [];

  constructor(props: TopicMessageViewProps) {
    super(props);
    this.currentParams = parseUrlParams();
    this.executeMessageSearch = this.executeMessageSearch.bind(this); // needed because we must pass the function directly as 'submit' prop
    this.isFilterMatch = this.isFilterMatch.bind(this);

    makeObservable(this);
  }

  componentDidMount() {
    // Initialize params from URL and/or defaults
    this.currentParams = parseUrlParams();

    // Always update URL with current params to ensure consistency
    updateUrlParams(this.currentParams);

    // Watch for URL parameter changes
    this.urlParamsReaction = autorun(
      () => {
        const urlParams = parseUrlParams();
        transaction(() => {
          this.currentParams = urlParams;
        });
      },
      { name: 'sync url parameters' }
    );

    // Auto search when parameters change
    this.autoSearchReaction = autorun(() => this.searchFunc('auto'), {
      delay: 100,
      name: 'auto search when parameters change',
    });

    // Quick search -> url
    this.quickSearchReaction = autorun(
      () => {
        updateUrlParams({ quickSearch: this.currentParams.quickSearch });
        // Also update the local storage value to keep it in sync
        uiState.topicSettings.quickSearch = this.currentParams.quickSearch;
      },
      { name: 'update query string' }
    );

    appGlobal.searchMessagesFunc = this.searchFunc;
  }

  componentWillUnmount() {
    if (this.autoSearchReaction) {
      this.autoSearchReaction();
    }
    if (this.quickSearchReaction) {
      this.quickSearchReaction();
    }
    if (this.urlParamsReaction) {
      this.urlParamsReaction();
    }

    this.messageSearch.stopSearch();

    appGlobal.searchMessagesFunc = undefined;
  }

  render() {
    return (
      <>
        <this.SearchControlsBar />

        {/* Message Table (or error display) */}
        {this.fetchError ? (
          <Alert status="error">
            <AlertIcon alignSelf="flex-start" />
            <Box>
              <AlertTitle>Backend Error</AlertTitle>
              <AlertDescription>
                <Box>Please check and modify the request before resubmitting.</Box>
                <Box mt="4">
                  <div className="codeBox">{(this.fetchError as Error).message ?? String(this.fetchError)}</div>
                </Box>
                <Button mt="4" onClick={() => this.executeMessageSearch()}>
                  Retry Search
                </Button>
              </AlertDescription>
            </Box>
          </Alert>
        ) : (
          <this.MessageTable />
        )}
      </>
    );
  }
  SearchControlsBar = observer(() => {
    const topic = this.props.topic;
    const canUseFilters = (api.topicPermissions.get(topic.topicName)?.canUseSearchFilters ?? true) && !isServerless();
    const [customStartOffsetValue, setCustomStartOffsetValue] = useState(0 as number | string);
    const customStartOffsetValid = !Number.isNaN(Number(customStartOffsetValue));

    const [currentJSFilter, setCurrentJSFilter] = useState<FilterEntry | null>(null);

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
            <span data-testid="start-offset-newest">{`Newest - ${String(this.currentParams.maxResults)}`}</span>
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

    // Determine the current offset origin based on startOffset
    const currentOffsetOrigin = (
      this.currentParams.startOffset >= 0 ? PartitionOffsetOrigin.Custom : this.currentParams.startOffset
    ) as PartitionOffsetOriginType;

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
                      if (this.currentParams.startOffset < 0) {
                        this.currentParams.startOffset = 0;
                      }
                    } else {
                      this.currentParams.startOffset = e;
                    }
                    updateUrlParams({ startOffset: this.currentParams.startOffset });
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
                          this.currentParams.startOffset = Number(e.target.value);
                          updateUrlParams({ startOffset: this.currentParams.startOffset });
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
                  this.currentParams.maxResults = c;
                  updateUrlParams({ maxResults: c });
                }}
                options={[1, 3, 5, 10, 20, 50, 100, 200, 500].map((i) => ({ value: i }))}
                value={this.currentParams.maxResults}
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
                          this.currentParams.partitionID = DEFAULT_SEARCH_PARAMS.partitionID;
                          updateUrlParams({ partitionID: this.currentParams.partitionID });
                        }}
                      >
                        <SingleSelect<number>
                          chakraStyles={inlineSelectChakraStyles}
                          onChange={(c) => {
                            this.currentParams.partitionID = c;
                            updateUrlParams({ partitionID: c });
                          }}
                          options={[
                            {
                              value: -1,
                              label: 'All',
                            },
                          ].concat(
                            range(0, topic.partitionCount).map((i) => ({
                              value: i,
                              label: String(i),
                            }))
                          )}
                          value={this.currentParams.partitionID}
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
                    // TODO: "You don't have permissions to use search filters in this topic",
                    // we need support for disabledReason in @redpanda-data/ui
                    isDisabled={!canUseFilters}
                    onClick={() => {
                      const filter = createFilterEntry({ isNew: true });
                      setCurrentJSFilter(filter);
                    }}
                  >
                    JavaScript Filter
                  </MenuItem>
                </MenuList>
              </Menu>
            </Flex>

            {/* Search Progress Indicator: "Consuming Messages 30/30" */}
            {Boolean(this.messageSearch.searchPhase && this.messageSearch.searchPhase.length > 0) && (
              <StatusIndicator
                bytesConsumed={prettyBytes(this.messageSearch.bytesConsumed)}
                fillFactor={(this.messageSearch.messages?.length ?? 0) / this.currentParams.maxResults}
                identityKey="messageSearch"
                messagesConsumed={String(this.messageSearch.totalMessagesConsumed)}
                progressText={`${this.messageSearch.messages?.length ?? 0} / ${this.currentParams.maxResults}`}
                // biome-ignore lint/style/noNonNullAssertion: not touching MobX observables
                statusText={this.messageSearch.searchPhase!}
              />
            )}
          </GridItem>

          {/*
                api.MessageSearchPhase && api.MessageSearchPhase.length > 0 && searchParams.filters.length>0 &&
                    <StatusIndicator
                        identityKey='messageSearch'
                        fillFactor={(api.Messages?.length ?? 0) / searchParams.maxResults}
                        statusText={api.MessageSearchPhase}
                        progressText={`${api.Messages?.length ?? 0} / ${searchParams.maxResults}`}
                        bytesConsumed={searchParams.filtersEnabled ? prettyBytes(api.MessagesBytesConsumed) : undefined}
                        messagesConsumed={searchParams.filtersEnabled ? String(api.MessagesTotalConsumed) : undefined}
                    />
                    */}

          <GridItem alignItems="flex-end" display="flex" gap={3} justifyContent="flex-end">
            <Menu>
              <MenuButton as={IconButton} icon={<MdOutlineSettings size="1.5rem" />} variant="outline" />
              <MenuList>
                <MenuItem
                  onClick={() => {
                    this.showDeserializersModal = true;
                  }}
                >
                  Deserialization
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    this.showColumnSettingsModal = true;
                  }}
                >
                  Column settings
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    this.showPreviewFieldsModal = true;
                  }}
                >
                  Preview fields
                </MenuItem>
              </MenuList>
            </Menu>
            <Flex alignItems="flex-end">
              {/* Refresh Button */}
              {this.messageSearch.searchPhase == null && (
                <Tooltip hasArrow label="Repeat current search" placement="top">
                  <IconButton
                    aria-label="Repeat current search"
                    icon={<SyncIcon />}
                    onClick={() => this.searchFunc('manual')}
                    variant="outline"
                  />
                </Tooltip>
              )}
              {this.messageSearch.searchPhase != null && (
                <Tooltip hasArrow label="Stop searching" placement="top">
                  <IconButton
                    aria-label="Stop searching"
                    colorScheme="red"
                    icon={<XCircleIcon />}
                    onClick={() => this.messageSearch.stopSearch()}
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
                this.currentParams.quickSearch = x.target.value;
                updateUrlParams({ quickSearch: x.target.value });
              }}
              placeholder="Filter table content ..."
              px={4}
              value={this.currentParams.quickSearch}
            />
            <Flex alignItems="center" fontSize="sm" gap={2} whiteSpace="nowrap">
              {this.messageSearch.searchPhase === null || this.messageSearch.searchPhase === 'Done' ? (
                <>
                  <Flex alignItems="center" gap={2}>
                    <MdDownload size={14} /> {prettyBytes(this.messageSearch.bytesConsumed)}
                  </Flex>
                  <Flex alignItems="center" gap={2}>
                    <MdOutlineTimer size={14} />{' '}
                    {this.messageSearch.elapsedMs ? prettyMilliseconds(this.messageSearch.elapsedMs) : ''}
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
                // Create a new object with isNew: false before pushing to the array
                // This ensures the object in the array has the correct state
                const savedFilter = { ...filter, isNew: false };
                uiState.topicSettings.searchParams.filters.push(savedFilter);
              } else {
                const idx = uiState.topicSettings.searchParams.filters.findIndex((x) => x.id === filter.id);
                if (idx !== -1) {
                  uiState.topicSettings.searchParams.filters.splice(idx, 1, filter);
                }
              }
              this.searchFunc('manual');
            }}
          />
        )}
      </>
    );
  });

  searchFunc = (source: 'auto' | 'manual') => {
    // need to do this first, so we trigger mobx
    // Include filters in the dependency tracking so MobX knows to re-run when filters change
    const filtersHash = uiState.topicSettings.searchParams.filters
      .map((f) => `${f.id}:${f.isActive}:${f.code}`)
      .join('|');
    const searchParams = `${this.currentParams.startOffset} ${this.currentParams.maxResults} ${this.currentParams.partitionID} ${uiState.topicSettings.searchParams.startTimestamp} ${uiState.topicSettings.searchParams.keyDeserializer} ${uiState.topicSettings.searchParams.valueDeserializer} ${filtersHash}`;

    untracked(() => {
      const phase = this.messageSearch.searchPhase;

      if (searchParams === this.currentSearchRun && source === 'auto') {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.log('ignoring serach, search params are up to date, and source is auto', {
          newParams: searchParams,
          oldParams: this.currentSearchRun,
          currentSearchPhase: phase,
          trigger: source,
        });
        return;
      }

      // Abort current search if one is running
      if (phase !== 'Done') {
        this.messageSearch.stopSearch();
      }

      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.log('starting a new message search', {
        newParams: searchParams,
        oldParams: this.currentSearchRun,
        currentSearchPhase: phase,
        trigger: source,
      });

      // Start new search
      this.currentSearchRun = searchParams;
      try {
        this.executeMessageSearch()
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          .catch(console.error)
          .finally(() => {
            untracked(() => {
              this.currentSearchRun = null;
            });
          });
      } catch (err) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error('error in message search', { error: err });
      }
    });
  };

  cancelSearch = () => this.messageSearch.stopSearch();

  isFilterMatch(_str: string, m: TopicMessage) {
    const searchStr = this.currentParams.quickSearch.toLowerCase();
    // If search string is empty, show all messages
    if (!searchStr) {
      return true;
    }

    if (m.offset.toString().toLowerCase().includes(searchStr)) {
      return true;
    }
    if (m.keyJson?.toLowerCase().includes(searchStr)) {
      return true;
    }
    if (m.valueJson?.toLowerCase().includes(searchStr)) {
      return true;
    }
    return false;
  }

  async loadLargeMessage(topicName: string, partitionID: number, offset: number) {
    // Create a new search that looks for only this message specifically
    const search = createMessageSearch();
    const searchReq: MessageSearchRequest = {
      filterInterpreterCode: '',
      maxResults: 1,
      partitionId: partitionID,
      startOffset: offset,
      startTimestamp: 0,
      topicName,
      includeRawPayload: true,
      ignoreSizeLimit: true,
      keyDeserializer: uiState.topicSettings.searchParams.keyDeserializer,
      valueDeserializer: uiState.topicSettings.searchParams.valueDeserializer,
    };
    const messages = await search.startSearch(searchReq);

    if (messages && messages.length === 1) {
      // We must update the old message (that still says "payload too large")
      // So we just find its index and replace it in the array we are currently displaying
      const indexOfOldMessage = this.messageSearch.messages.findIndex(
        (x) => x.partitionID === partitionID && x.offset === offset
      );
      if (indexOfOldMessage > -1) {
        this.messageSearch.messages[indexOfOldMessage] = messages[0];
      } else {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error('LoadLargeMessage: cannot find old message to replace', {
          searchReq,
          messages,
        });
        throw new Error(
          'LoadLargeMessage: Cannot find old message to replace (message results must have changed since the load was started)'
        );
      }
    } else {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('LoadLargeMessage: messages response is empty', { messages });
      throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
    }
  }

  @computed
  get activePreviewTags(): PreviewTagV2[] {
    return uiState.topicSettings.previewTags.filter((t) => t.isActive);
  }

  MessageTable = observer(() => {
    const toast = useToast();
    const breakpoint = useBreakpoint({ ssr: false });

    // Use the useFilterableData hook to filter messages
    const { data: filteredMessages } = useFilterableData(
      this.messageSearch.messages,
      (filterText, m) => this.isFilterMatch(filterText, m),
      this.currentParams.quickSearch,
      100
    );

    const paginationParams = usePaginationParams(filteredMessages.length, uiState.topicSettings.searchParams.pageSize);

    const tsFormat = uiState.topicSettings.previewTimestamps;
    const hasKeyTags = uiState.topicSettings.previewTags.count((x) => x.isActive && x.searchInMessageKey) > 0;

    function onCopyValue(original: TopicMessage) {
      navigator.clipboard
        .writeText(
          getPayloadAsString((original.value.payload ?? original.value.rawBytes) as string | Uint8Array | object)
        )
        .then(() => {
          toast({
            status: 'success',
            description: 'Value copied to clipboard',
          });
        })
        .catch(navigatorClipboardErrorHandler);
    }

    function onCopyKey(original: TopicMessage) {
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
                  this.showDeserializersModal = true;
                  e.stopPropagation(); // don't sort
                }}
                type="button"
              >
                <Badge>
                  Deserializer: {PAYLOAD_ENCODING_LABELS[uiState.topicSettings.searchParams.keyDeserializer]}
                </Badge>
              </button>
            </Flex>
          ) : (
            'Key'
          ),
        size: hasKeyTags ? 300 : 1,
        accessorKey: 'key',
        cell: ({ row: { original } }) => (
          <MessageKeyPreview msg={original} previewFields={() => this.activePreviewTags} />
        ),
      },
      value: {
        header: () =>
          isValueDeserializerActive ? (
            <Flex alignItems="center" display="inline-flex" gap={2}>
              Value{' '}
              <button
                onClick={(e) => {
                  this.showDeserializersModal = true;
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
            isCompactTopic={this.props.topic.cleanupPolicy.includes('compact')}
            msg={original}
            previewFields={() => this.activePreviewTags}
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
              <MenuItem isDisabled={original.key.isPayloadNull} onClick={() => onCopyKey(original)}>
                Copy Key
              </MenuItem>
              <MenuItem isDisabled={original.value.isPayloadNull} onClick={() => onCopyValue(original)}>
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
                  this.downloadMessages = [original];
                }}
              >
                Save to File
              </MenuItem>
            </MenuList>
          </Menu>
        ),
      },
    ];

    return (
      <>
        <DataTable<TopicMessage>
          columns={columns}
          data={filteredMessages}
          emptyText="No messages"
          isLoading={this.messageSearch.searchPhase !== null}
          onPaginationChange={onPaginationChange(paginationParams, ({ pageSize, pageIndex }) => {
            uiState.topicSettings.searchParams.pageSize = pageSize;
            editQuery((query) => {
              query.page = String(pageIndex);
              query.pageSize = String(pageSize);
            });
          })}
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
                this.loadLargeMessage(this.props.topic.topicName, original.partitionID, original.offset)
              }
              msg={original}
              onCopyKey={onCopyKey}
              onCopyValue={onCopyValue}
              onDownloadRecord={() => {
                this.downloadMessages = [original];
              }}
            />
          )}
        />
        <Button
          isDisabled={!this.messageSearch.messages || this.messageSearch.messages.length === 0}
          mt={4}
          onClick={() => {
            this.downloadMessages = this.messageSearch.messages;
          }}
          variant="outline"
        >
          <span style={{ paddingRight: '4px' }}>
            <DownloadIcon />
          </span>
          Save Messages
        </Button>

        <SaveMessagesDialog
          messages={this.downloadMessages}
          onClose={() => (this.downloadMessages = null)}
          onRequireRawPayload={() => this.executeMessageSearch()}
        />

        <ColumnSettings
          getShowDialog={() => this.showColumnSettingsModal}
          setShowDialog={(s) => (this.showColumnSettingsModal = s)}
        />

        <PreviewFieldsModal
          getShowDialog={() => this.showPreviewFieldsModal}
          messageSearch={this.messageSearch}
          setShowDialog={(s) => (this.showPreviewFieldsModal = s)}
        />

        <DeserializersModal
          getShowDialog={() => this.showDeserializersModal}
          setShowDialog={(s) => (this.showDeserializersModal = s)}
        />
      </>
    );
  });

  @action toggleRecordExpand(r: TopicMessage) {
    const key = `${r.offset} ${r.partitionID}${r.timestamp}`;
    // try collapsing it, removeAll returns the number of matches
    const removed = this.expandedKeys.removeAll((x) => x === key);
    if (removed === 0) {
      // wasn't expanded, so expand it now
      this.expandedKeys.push(key);
    }
  }

  executeMessageSearch(): Promise<TopicMessage[]> {
    const canUseFilters =
      (api.topicPermissions.get(this.props.topic.topicName)?.canUseSearchFilters ?? true) && !isServerless();

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
      topicName: this.props.topic.topicName,
      partitionId: this.currentParams.partitionID,
      startOffset: this.currentParams.startOffset,
      startTimestamp: uiState.topicSettings.searchParams.startTimestamp,
      maxResults: this.currentParams.maxResults,
      filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
      includeRawPayload: true,
      keyDeserializer: uiState.topicSettings.searchParams.keyDeserializer,
      valueDeserializer: uiState.topicSettings.searchParams.valueDeserializer,
    } as MessageSearchRequest;

    return transaction(() => {
      try {
        this.fetchError = null;
        return this.messageSearch.startSearch(request).catch((err) => {
          const msg = (err as Error).message ?? String(err);
          // biome-ignore lint/suspicious/noConsole: intentional console usage
          console.error(`error in searchTopicMessages: ${msg}`);
          this.fetchError = err;
          return [];
        });
      } catch (error: unknown) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.error(`error in searchTopicMessages: ${(error as Error).message ?? String(error)}`);
        this.fetchError = error as Error;
        return Promise.resolve([]);
      }
    });
  }
}

@observer
class SaveMessagesDialog extends Component<{
  messages: TopicMessage[] | null;
  onClose: () => void;
  onRequireRawPayload: () => Promise<TopicMessage[]>;
}> {
  @observable isOpen = false;
  @observable format = 'json' as 'json' | 'csv';
  @observable includeRawContent = false;

  radioStyle = { display: 'block', lineHeight: '30px' };

  constructor(p: {
    messages: TopicMessage[] | null;
    onClose: () => void;
    onRequireRawPayload: () => Promise<TopicMessage[]>;
  }) {
    super(p);
    makeObservable(this);
  }

  render() {
    const { messages, onClose } = this.props;
    const count = messages?.length ?? 0;
    const title = count > 1 ? 'Save Messages' : 'Save Message';

    // Keep dialog open after closing it, so it can play its closing animation
    if (count > 0 && !this.isOpen) {
      setTimeout(() => (this.isOpen = true));
    }
    if (this.isOpen && count === 0) {
      setTimeout(() => (this.isOpen = false));
    }

    return (
      <Modal isOpen={count > 0} onClose={onClose}>
        <ModalOverlay />
        <ModalContent minW="2xl">
          <ModalHeader>{title}</ModalHeader>
          <ModalBody display="flex" flexDirection="column" gap="4">
            <div>Select the format in which you want to save {count === 1 ? 'the message' : 'all messages'}</div>
            <Box py={2}>
              <RadioGroup
                name="format"
                onChange={(value) => (this.format = value)}
                options={[
                  {
                    value: 'json',
                    label: 'JSON',
                  },
                  {
                    value: 'csv',
                    label: 'CSV',
                  },
                ]}
                value={this.format}
              />
            </Box>
            <Checkbox isChecked={this.includeRawContent} onChange={(e) => (this.includeRawContent = e.target.checked)}>
              Include raw data
            </Checkbox>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button colorScheme="red" onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              isDisabled={!this.props.messages || this.props.messages.length === 0}
              onClick={() => this.saveMessages()}
              variant="solid"
            >
              Save Messages
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }

  saveMessages() {
    const messages = this.props.messages;
    if (!messages) {
      return;
    }

    const cleanMessages = this.cleanMessages(messages);

    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.log(`saving cleaned messages; messages: ${messages.length}`);

    if (this.format === 'json') {
      const json = toJson(cleanMessages, 4);
      const link = document.createElement('a');
      const file = new Blob([json], { type: 'application/json' });
      link.href = URL.createObjectURL(file);
      link.download = 'messages.json';
      document.body.appendChild(link); // required in firefox
      link.click();
    } else if (this.format === 'csv') {
      const csvContent = this.convertToCSV(cleanMessages as TopicMessage[]);
      const link = document.createElement('a');
      const file = new Blob([csvContent], { type: 'text/csv' });
      link.href = URL.createObjectURL(file);
      link.download = 'messages.csv';
      document.body.appendChild(link); // required in firefox
      link.click();
    }

    this.props.onClose();
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: complexity 40, refactor later
  convertToCSV(messages: TopicMessage[]): string {
    if (messages.length === 0) {
      return '';
    }

    const headers: string[] = [...COLUMN_ORDER];

    // Add other common fields that might not be in COLUMN_ORDER
    if (messages[0].compression && !headers.includes('compression')) {
      headers.push('compression');
    }
    if (messages[0].isTransactional !== undefined && !headers.includes('isTransactional')) {
      headers.push('isTransactional');
    }

    const csvRows: string[] = [];

    // Add the headers
    csvRows.push(headers.join(','));

    // Add the data
    for (const message of messages) {
      const values: (string | number | boolean)[] = [];

      // Add fields in the same order as headers
      for (const header of headers) {
        if (header === 'key') {
          if (message.key) {
            const keyValue = message.key.payload || '';
            values.push(
              typeof keyValue === 'object'
                ? JSON.stringify(keyValue).replace(/,/g, ';')
                : String(keyValue).replace(/,/g, ';')
            );
          } else {
            values.push('');
          }
        } else if (header === 'value') {
          if (message.value) {
            const valuePayload = message.value.payload || '';
            values.push(
              typeof valuePayload === 'object'
                ? JSON.stringify(valuePayload).replace(/,/g, ';')
                : String(valuePayload).replace(/,/g, ';')
            );
          } else {
            values.push('');
          }
        } else if (header === 'keySize') {
          values.push(message.key?.size || '');
        } else if (header === 'valueSize') {
          values.push(message.value?.size || '');
        } else {
          // For other simple fields like partitionID, offset, timestamp, compression, isTransactional
          const messageValue = (message as Record<string, unknown>)[header];
          values.push(
            messageValue !== undefined && messageValue !== null ? (messageValue as string | number | boolean) : ''
          );
        }
      }

      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }

  cleanMessages(messages: TopicMessage[]): unknown[] {
    const ar: unknown[] = [];

    // create a copy of each message, omitting properties that don't make
    // sense for the user, like 'size' or caching properties like 'keyJson'.
    const includeRaw = this.includeRawContent;

    const cleanPayload = (p: Payload): Payload | undefined => {
      if (!p) {
        return undefined;
      }

      const cleanedPayload = {
        payload: p.payload,
        rawPayload: includeRaw && p.rawBytes ? base64FromUInt8Array(p.rawBytes) : undefined,
        encoding: p.encoding,
        isPayloadNull: p.isPayloadNull,
        schemaId: 0,
        size: p.size,
      } as Payload;

      if (p.schemaId && p.schemaId !== 0) {
        cleanedPayload.schemaId = p.schemaId;
      }

      return cleanedPayload;
    };

    for (const src of messages) {
      const msg = {} as Partial<typeof src>;

      msg.partitionID = src.partitionID;
      msg.offset = src.offset;
      msg.timestamp = src.timestamp;
      msg.compression = src.compression;
      msg.isTransactional = src.isTransactional;

      msg.headers = src.headers.map((h) => ({
        key: h.key,
        value: cleanPayload(h.value) as Payload,
      }));

      msg.key = cleanPayload(src.key);
      msg.value = cleanPayload(src.value);

      ar.push(msg);
    }

    return ar;
  }
}

@observer
class MessageKeyPreview extends Component<{ msg: TopicMessage; previewFields: () => PreviewTagV2[] }> {
  render() {
    const msg = this.props.msg;
    const key = msg.key;

    if (key.troubleshootReport && key.troubleshootReport.length > 0) {
      return (
        <Flex alignItems="center" color="red.600" gap="2">
          <WarningIcon fontSize="1.25em" />
          There were issues deserializing the key
        </Flex>
      );
    }

    const isPrimitive =
      typeof key.payload === 'string' || typeof key.payload === 'number' || typeof key.payload === 'boolean';
    try {
      if (key.isPayloadNull) {
        return <EmptyBadge mode="null" />;
      }
      if (key.payload == null || (typeof key.payload === 'string' && key.payload.length === 0)) {
        return <EmptyBadge mode="empty" />;
      }

      let text: ReactNode = <></>;

      if (key.encoding === 'binary') {
        text = cullText(msg.keyBinHexPreview as string, 44);
      } else if (key.encoding === 'utf8WithControlChars') {
        text = highlightControlChars(key.payload as string);
      } else if (isPrimitive) {
        text = cullText(key.payload as string, 44);
      } else {
        // Only thing left is 'object'
        // Stuff like 'bigint', 'function', or 'symbol' would not have been deserialized
        const previewTags = this.props.previewFields().filter((t) => t.searchInMessageValue);
        if (previewTags.length > 0) {
          const tags = getPreviewTags(key.payload as Record<string, unknown>, previewTags);
          text = (
            <span className="cellDiv fade" style={{ fontSize: '95%' }}>
              <div className={`previewTags previewTags-${uiState.topicSettings.previewDisplayMode}`}>
                {tags.map((t, i) => (
                  <React.Fragment key={i}>{t}</React.Fragment>
                ))}
              </div>
            </span>
          );
          return text;
        }
        // Normal display (json, no filters). Just stringify the whole object
        text = cullText(JSON.stringify(key.payload), 44);
      }

      return (
        <Flex flexDirection="column">
          <span className="cellDiv" style={{ minWidth: '10ch', width: 'auto', maxWidth: '45ch' }}>
            <code style={{ fontSize: '95%' }}>{text}</code>
          </span>
          <Text color="gray.500">
            {key.encoding.toUpperCase()} - {prettyBytes(key.size)}
          </Text>
        </Flex>
      );
    } catch (e) {
      return <span style={{ color: 'red' }}>Error in RenderPreview: {(e as Error).message ?? String(e)}</span>;
    }
  }
}

@observer
class StartOffsetDateTimePicker extends Component<Record<string, never>> {
  constructor(p: Record<string, never>) {
    super(p);
    const searchParams = uiState.topicSettings.searchParams;
    if (!searchParams.startTimestampWasSetByUser) {
      // so far, the user did not change the startTimestamp, so we set it to 'now'
      searchParams.startTimestamp = Date.now();
    }
  }

  render() {
    const searchParams = uiState.topicSettings.searchParams;
    // new Date().getTimezoneOffset()

    return (
      <DateTimeInput
        onChange={(value) => {
          searchParams.startTimestamp = value;
          searchParams.startTimestampWasSetByUser = true;
        }}
        value={searchParams.startTimestamp}
      />
    );
  }
}

@observer
export class MessagePreview extends Component<{
  msg: TopicMessage;
  previewFields: () => PreviewTagV2[];
  isCompactTopic: boolean;
}> {
  render() {
    const msg = this.props.msg;
    const value = msg.value;

    if (value.troubleshootReport && value.troubleshootReport.length > 0) {
      return (
        <Flex alignItems="center" color="red.600" gap="2">
          <WarningIcon fontSize="1.25em" />
          There were issues deserializing the value
        </Flex>
      );
    }

    if (value.isPayloadTooLarge) {
      return (
        <Flex alignItems="center" color="blue.500" gap="2">
          <InfoIcon fontSize="1.25em" />
          Message size exceeds the display limit.
        </Flex>
      );
    }

    const isPrimitive =
      typeof value.payload === 'string' || typeof value.payload === 'number' || typeof value.payload === 'boolean';

    try {
      let text: ReactNode = <></>;

      if (value.isPayloadNull) {
        return <EmptyBadge mode="null" />;
      }
      if (
        value.encoding === 'null' ||
        value.payload == null ||
        (typeof value.payload === 'string' && value.payload.length === 0)
      ) {
        return <EmptyBadge mode="empty" />;
      }
      if (msg.value.encoding === 'binary') {
        // If the original data was binary, display as hex dump
        text = msg.valueBinHexPreview as React.ReactNode;
      } else if (isPrimitive) {
        // If we can show the value as a primitive, do so.
        text = value.payload as React.ReactNode;
      } else {
        // Only thing left is 'object'
        // Stuff like 'bigint', 'function', or 'symbol' would not have been deserialized
        const previewTags = this.props.previewFields().filter((t) => t.searchInMessageValue);
        if (previewTags.length > 0) {
          const tags = getPreviewTags(value.payload as Record<string, unknown>, previewTags);
          text = (
            <span className="cellDiv fade" style={{ fontSize: '95%' }}>
              <div className={`previewTags previewTags-${uiState.topicSettings.previewDisplayMode}`}>
                {tags.map((t, i) => (
                  <React.Fragment key={i}>{t}</React.Fragment>
                ))}
              </div>
            </span>
          );
          return text;
        }
        // Normal display (json, no filters). Just stringify the whole object
        text = cullText(JSON.stringify(value.payload), 300);
      }

      return (
        <Flex flexDirection="column">
          <code>
            <span className="cellDiv" style={{ fontSize: '95%' }}>
              {text}
            </span>
          </code>
          <Text color="gray.500">
            {value.encoding.toUpperCase()} - {prettyBytes(value.size)}
          </Text>
        </Flex>
      );
    } catch (e) {
      return <span style={{ color: 'red' }}>Error in RenderPreview: {(e as Error).message ?? String(e)}</span>;
    }
  }
}

const ExpandedMessageFooter: FC<{ children?: ReactNode; onDownloadRecord?: () => void }> = ({
  children,
  onDownloadRecord,
}) => (
  <Flex gap={2} justifyContent="flex-end" my={4}>
    {children}
    {onDownloadRecord && (
      <Button onClick={onDownloadRecord} variant="outline">
        Download Record
      </Button>
    )}
  </Flex>
);

export const ExpandedMessage: FC<{
  msg: TopicMessage;
  loadLargeMessage: () => Promise<void>;
  onDownloadRecord?: () => void;
  onCopyKey?: (original: TopicMessage) => void;
  onCopyValue?: (original: TopicMessage) => void;
}> = ({ msg, loadLargeMessage, onDownloadRecord, onCopyKey, onCopyValue }) => {
  const bg = useColorModeValue('gray.50', 'gray.600');

  return (
    <Box bg={bg} px={10} py={6}>
      <MessageMetaData msg={msg} />
      <RpTabs
        defaultIndex={1}
        isFitted
        items={[
          {
            key: 'key',
            name: (
              <Box minWidth="6rem">
                {msg.key === null || msg.key.size === 0 ? 'Key' : `Key (${prettyBytes(msg.key.size)})`}
              </Box>
            ),
            isDisabled: msg.key == null || msg.key.size === 0,
            component: (
              <Box>
                <TroubleshootReportViewer payload={msg.key} />
                <PayloadComponent loadLargeMessage={loadLargeMessage} payload={msg.key} />
                <ExpandedMessageFooter onDownloadRecord={onDownloadRecord}>
                  {onCopyKey && (
                    <Button isDisabled={msg.key.isPayloadNull} onClick={() => onCopyKey(msg)} variant="outline">
                      Copy Key
                    </Button>
                  )}
                </ExpandedMessageFooter>
              </Box>
            ),
          },
          {
            key: 'value',
            name: (
              <Box minWidth="6rem">
                {msg.value === null || msg.value.size === 0 ? 'Value' : `Value (${prettyBytes(msg.value.size)})`}
              </Box>
            ),
            component: (
              <Box>
                <TroubleshootReportViewer payload={msg.value} />
                <PayloadComponent loadLargeMessage={loadLargeMessage} payload={msg.value} />
                <ExpandedMessageFooter onDownloadRecord={onDownloadRecord}>
                  {onCopyValue && (
                    <Button isDisabled={msg.value.isPayloadNull} onClick={() => onCopyValue(msg)} variant="outline">
                      Copy Value
                    </Button>
                  )}
                </ExpandedMessageFooter>
              </Box>
            ),
          },
          {
            key: 'headers',
            name: <Box minWidth="6rem">{msg.headers.length === 0 ? 'Headers' : `Headers (${msg.headers.length})`}</Box>,
            isDisabled: msg.headers.length === 0,
            component: (
              <Box>
                <MessageHeaders msg={msg} />
                {onDownloadRecord && <ExpandedMessageFooter onDownloadRecord={onDownloadRecord} />}
              </Box>
            ),
          },
        ]}
        variant="fitted"
      />
    </Box>
  );
};

const PayloadComponent = observer((p: { payload: Payload; loadLargeMessage: () => Promise<void> }) => {
  const { payload, loadLargeMessage } = p;
  const toast = useToast();
  const [isLoadingLargeMessage, setLoadingLargeMessage] = useState(false);

  if (payload.isPayloadTooLarge) {
    return (
      <Flex flexDirection="column" gap="4">
        <Flex alignItems="center" gap="2">
          Because this message size exceeds the display limit, loading it could cause performance degradation.
        </Flex>
        <Button
          data-testid="load-anyway-button"
          isLoading={isLoadingLargeMessage}
          loadingText="Loading..."
          onClick={() => {
            setLoadingLargeMessage(true);
            loadLargeMessage()
              .catch((err) =>
                toast({
                  status: 'error',
                  description: err instanceof Error ? err.message : String(err),
                })
              )
              .finally(() => setLoadingLargeMessage(false));
          }}
          size="small"
          variant="outline"
          width="10rem"
        >
          Load anyway
        </Button>
      </Flex>
    );
  }

  try {
    if (payload === null || payload === undefined || payload.payload === null || payload.payload === undefined) {
      return <code>null</code>;
    }

    const val = payload.payload;
    const isPrimitive = typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean';

    if (payload.encoding === 'binary') {
      const mode = 'hex' as 'ascii' | 'raw' | 'hex';
      if (mode === 'raw') {
        return (
          <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{val as React.ReactNode}</code>
        );
      }
      if (mode === 'hex') {
        const rawBytes = payload.rawBytes ?? payload.normalizedPayload;

        if (rawBytes && (typeof rawBytes === 'string' || Array.isArray(rawBytes) || rawBytes instanceof Uint8Array)) {
          let result = '';
          for (const rawByte of rawBytes as Uint8Array) {
            result += `${rawByte.toString(16).padStart(2, '0')} `;
          }
          return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{result}</code>;
        }
        return <div>Raw bytes not available</div>;
      }
      const str = String(val);
      let result = '';
      for (let i = 0; i < str.length; i++) {
        let ch = String.fromCharCode(str.charCodeAt(i)); // str.charAt(i);
        ch = PRINTABLE_CHAR_REGEX.test(ch) ? ch : '. ';
        result += `${ch} `;
      }

      return <code style={{ fontSize: '.85em', lineHeight: '1em', whiteSpace: 'normal' }}>{result}</code>;
    }

    // Decode payload from base64 and render control characters as code highlighted text, such as
    // `NUL`, `ACK` etc.
    if (payload.encoding === 'utf8WithControlChars') {
      const elements = highlightControlChars(val as string);

      return (
        <div className="codeBox" data-testid="payload-content">
          {elements}
        </div>
      );
    }

    if (isPrimitive) {
      return (
        <div className="codeBox" data-testid="payload-content">
          {String(val)}
        </div>
      );
    }

    return <KowlJsonView srcObj={val} />;
  } catch (e) {
    return <span style={{ color: 'red' }}>Error in RenderExpandedMessage: {(e as Error).message ?? String(e)}</span>;
  }
});

function highlightControlChars(str: string, maxLength?: number): ReactNode[] {
  const elements: ReactNode[] = [];
  // To reduce the number of JSX elements we try to append normal chars to a single string
  // until we hit a control character.
  let sequentialChars = '';
  let numChars = 0;

  for (const char of str) {
    const code = char.charCodeAt(0);
    if (code < 32) {
      if (sequentialChars.length > 0) {
        elements.push(sequentialChars);
        sequentialChars = '';
      }
      elements.push(<span className="controlChar">{getControlCharacterName(code)}</span>);
      if (code === 10) {
        // LineFeed (\n) should be rendered properly
        elements.push(<br />);
      }
    } else {
      sequentialChars += char;
    }

    if (maxLength !== undefined) {
      numChars++;
      if (numChars >= maxLength) {
        break;
      }
    }
  }

  if (sequentialChars.length > 0) {
    elements.push(sequentialChars);
  }

  return elements;
}

function getControlCharacterName(code: number): string {
  switch (code) {
    case 0:
      return 'NUL';
    case 1:
      return 'SOH';
    case 2:
      return 'STX';
    case 3:
      return 'ETX';
    case 4:
      return 'EOT';
    case 5:
      return 'ENQ';
    case 6:
      return 'ACK';
    case 7:
      return 'BEL';
    case 8:
      return 'BS';
    case 9:
      return 'HT';
    case 10:
      return 'LF';
    case 11:
      return 'VT';
    case 12:
      return 'FF';
    case 13:
      return 'CR';
    case 14:
      return 'SO';
    case 15:
      return 'SI';
    case 16:
      return 'DLE';
    case 17:
      return 'DC1';
    case 18:
      return 'DC2';
    case 19:
      return 'DC3';
    case 20:
      return 'DC4';
    case 21:
      return 'NAK';
    case 22:
      return 'SYN';
    case 23:
      return 'ETB';
    case 24:
      return 'CAN';
    case 25:
      return 'EM';
    case 26:
      return 'SUB';
    case 27:
      return 'ESC';
    case 28:
      return 'FS';
    case 29:
      return 'GS';
    case 30:
      return 'RS';
    case 31:
      return 'US';
    default:
      return '';
  }
}

const TroubleshootReportViewer = observer((props: { payload: Payload }) => {
  const report = props.payload.troubleshootReport;
  const [show, setShow] = useState(true);

  if (!report) {
    return null;
  }
  if (report.length === 0) {
    return null;
  }

  return (
    <Box mb="4" mt="4">
      <Heading as="h4">Deserialization Troubleshoot Report</Heading>
      <Alert background="red.50" flexDirection="column" my={4} status="error" variant="subtle">
        <AlertTitle
          alignItems="center"
          alignSelf="flex-start"
          display="flex"
          flexDirection="row"
          fontWeight="normal"
          pb="4"
        >
          <AlertIcon /> Errors were encountered when deserializing this message
          <Link onClick={() => setShow(!show)} pl="2">
            {show ? 'Hide' : 'Show'}
          </Link>
        </AlertTitle>
        <AlertDescription display={show ? undefined : 'none'} whiteSpace="pre-wrap">
          <Grid columnGap="4" rowGap="1" templateColumns="auto 1fr">
            {report.map((e) => (
              <>
                <GridItem
                  fontWeight="bold"
                  key={`${e.serdeName}-name`}
                  pl="8"
                  px="5"
                  py="2"
                  textTransform="capitalize"
                  w="100%"
                >
                  {e.serdeName}
                </GridItem>
                <GridItem
                  background="red.100"
                  fontFamily="monospace"
                  key={`${e.serdeName}-message`}
                  px="5"
                  py="2"
                  w="100%"
                >
                  {e.message}
                </GridItem>
              </>
            ))}
          </Grid>
        </AlertDescription>
      </Alert>
    </Box>
  );
});

const MessageMetaData = observer((props: { msg: TopicMessage }) => {
  const msg = props.msg;
  const data: { [k: string]: React.ReactNode } = {
    Partition: msg.partitionID,
    Offset: numberToThousandsString(msg.offset),
    Key: msg.key.isPayloadNull ? 'Null' : `${titleCase(msg.key.encoding)} (${prettyBytes(msg.key.size)})`,
    Value: msg.value.isPayloadNull
      ? 'Null'
      : `${titleCase(msg.value.encoding)} (${msg.value.schemaId > 0 ? `${msg.value.schemaId} / ` : ''}${prettyBytes(msg.value.size)})`,
    Headers: msg.headers.length > 0 ? `${msg.headers.length}` : 'No headers set',
    Compression: msg.compression,
    Transactional: msg.isTransactional ? 'true' : 'false',
    // "Producer ID": "(msg.producerId)",
  };

  if (msg.value.schemaId) {
    data.Schema = <MessageSchema schemaId={msg.value.schemaId} />;
  }

  return (
    <Flex gap={10} my={6}>
      {Object.entries(data).map(([k, v]) => (
        <Flex direction="column" key={k} rowGap=".4em">
          <Text fontSize="md" fontWeight="600">
            {k}
          </Text>
          <Text color="" fontSize="sm">
            {v}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
});

const MessageSchema = observer((p: { schemaId: number }) => {
  const subjects = api.schemaUsagesById.get(p.schemaId);
  if (!subjects || subjects.length === 0) {
    api.refreshSchemaUsagesById(p.schemaId);
    return <>ID {p.schemaId} (unknown subject)</>;
  }

  const s = subjects[0];
  return (
    <Link as={ReactRouterLink} to={`/schema-registry/subjects/${encodeURIComponent(s.subject)}?version=${s.version}`}>
      {s.subject} (version {s.version})
    </Link>
  );
});

const MessageHeaders = observer((props: { msg: TopicMessage }) => {
  return (
    <div className="messageHeaders">
      <div>
        <DataTable<{ key: string; value: Payload }>
          columns={[
            {
              size: 200,
              header: 'Key',
              accessorKey: 'key',
              cell: ({
                row: {
                  original: { key: headerKey },
                },
              }) => (
                <span className="cellDiv" style={{ width: 'auto' }}>
                  {headerKey ? <Ellipsis>{toSafeString(headerKey)}</Ellipsis> : renderEmptyIcon('Empty Key')}
                </span>
              ),
            },
            {
              size: Number.POSITIVE_INFINITY,
              header: 'Value',
              accessorKey: 'value',
              cell: ({
                row: {
                  original: { value: headerValue },
                },
              }) => {
                if (typeof headerValue.payload === 'undefined') {
                  return renderEmptyIcon('"undefined"');
                }
                if (headerValue.payload === null) {
                  return renderEmptyIcon('"null"');
                }
                if (typeof headerValue.payload === 'number') {
                  return <span>{String(headerValue.payload)}</span>;
                }

                if (typeof headerValue.payload === 'string') {
                  return <span className="cellDiv">{headerValue.payload}</span>;
                }

                // object
                return <span className="cellDiv">{toSafeString(headerValue.payload)}</span>;
              },
            },
            {
              size: 120,
              header: 'Encoding',
              accessorKey: 'value',
              cell: ({
                row: {
                  original: { value: payload },
                },
              }) => <span className="nowrap">{payload.encoding}</span>,
            },
          ]}
          data={props.msg.headers}
          pagination
          sorting
          subComponent={({ row: { original: header } }) => (
            <Box px={10} py={6}>
              {typeof header.value?.payload !== 'object' ? (
                <div className="codeBox" style={{ margin: '0', width: '100%' }}>
                  {toSafeString(header.value.payload)}
                </div>
              ) : (
                <KowlJsonView srcObj={header.value.payload as object} style={{ margin: '2em 0' }} />
              )}
            </Box>
          )}
        />
      </div>
    </div>
  );
});

const ColumnSettings: FC<{
  getShowDialog: () => boolean;
  setShowDialog: (val: boolean) => void;
}> = observer(({ getShowDialog, setShowDialog }) => {
  const columnSettings: ColumnList[] = [
    { title: 'Offset', dataIndex: 'offset' },
    { title: 'Partition', dataIndex: 'partitionID' },
    { title: 'Timestamp', dataIndex: 'timestamp' },
    { title: 'Key', dataIndex: 'key' },
    { title: 'Value', dataIndex: 'value' },
    { title: 'Key Size', dataIndex: 'keySize' },
    { title: 'Value Size', dataIndex: 'valueSize' },
  ];

  return (
    <Modal
      isOpen={getShowDialog()}
      onClose={() => {
        setShowDialog(false);
      }}
    >
      <ModalOverlay />
      <ModalContent minW="4xl">
        <ModalHeader>Column Settings</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Text>Choose which columns will be shown in the messages table, as well as the format of the timestamp.</Text>
          <Box my={6}>
            <Label text="Columns shown">
              <Stack direction="row" spacing={5}>
                {columnSettings.map(({ title, dataIndex }) => (
                  <Checkbox
                    isChecked={!!uiState.topicSettings.previewColumnFields.find((x) => x.dataIndex === dataIndex)}
                    key={dataIndex}
                    onChange={({ target: { checked } }) => {
                      if (checked) {
                        uiState.topicSettings.previewColumnFields.pushDistinct({
                          title,
                          dataIndex,
                        });
                      } else {
                        const idxToRemove = uiState.topicSettings.previewColumnFields.findIndex(
                          (x) => x.dataIndex === dataIndex
                        );
                        uiState.topicSettings.previewColumnFields.splice(idxToRemove, 1);
                      }
                    }}
                    size="lg"
                  >
                    {title}
                  </Checkbox>
                ))}
              </Stack>
            </Label>
            <Button
              mt={2}
              onClick={() => {
                uiState.topicSettings.previewColumnFields = [];
              }}
              // we need to pass this using sx to increase specificity, using p={0} won't work
              sx={{ padding: 0 }}
              variant="link"
            >
              Clear
            </Button>
          </Box>
          <Grid gap={4} my={6} templateColumns="1fr 2fr">
            <GridItem>
              <Label text="Timestamp format">
                <SingleSelect<TimestampDisplayFormat>
                  onChange={(e) => (uiState.topicSettings.previewTimestamps = e)}
                  options={[
                    { label: 'Local DateTime', value: 'default' },
                    { label: 'Unix DateTime', value: 'unixTimestamp' },
                    { label: 'Relative', value: 'relative' },
                    { label: 'Local Date', value: 'onlyDate' },
                    { label: 'Local Time', value: 'onlyTime' },
                    { label: 'Unix Millis', value: 'unixMillis' },
                  ]}
                  value={uiState.topicSettings.previewTimestamps}
                />
              </Label>
            </GridItem>
            <GridItem>
              <Label text="Preview">
                <TimestampDisplay format={uiState.topicSettings.previewTimestamps} unixEpochMillisecond={Date.now()} />
              </Label>
            </GridItem>
          </Grid>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button
            colorScheme="red"
            onClick={() => {
              setShowDialog(false);
            }}
          >
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

const PreviewFieldsModal: FC<{
  getShowDialog: () => boolean;
  setShowDialog: (val: boolean) => void;
  messageSearch: MessageSearch;
}> = observer(({ getShowDialog, setShowDialog, messageSearch }) => (
  <Modal
    isOpen={getShowDialog()}
    onClose={() => {
      setShowDialog(false);
    }}
  >
    <ModalOverlay />
    <ModalContent minW="4xl">
      <ModalHeader>Preview fields</ModalHeader>
      <ModalCloseButton />
      <ModalBody>
        <PreviewSettings messageSearch={messageSearch} />
      </ModalBody>
      <ModalFooter gap={2}>
        <Button
          colorScheme="red"
          onClick={() => {
            setShowDialog(false);
          }}
        >
          Close
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
));

const DeserializersModal: FC<{
  getShowDialog: () => boolean;
  setShowDialog: (val: boolean) => void;
}> = observer(({ getShowDialog, setShowDialog }) => {
  const searchParams = uiState.topicSettings.searchParams;

  return (
    <Modal
      isOpen={getShowDialog()}
      onClose={() => {
        setShowDialog(false);
      }}
    >
      <ModalOverlay />
      <ModalContent minW="xl">
        <ModalHeader>Deserialize</ModalHeader>
        <ModalCloseButton />
        <ModalBody display="flex" flexDirection="column" gap={4}>
          <Text>
            Redpanda attempts to automatically detect a deserialization strategy. You can choose one manually here.
          </Text>
          <Box>
            <Label text="Key Deserializer">
              <SingleSelect<PayloadEncoding>
                onChange={(e) => (searchParams.keyDeserializer = e)}
                options={payloadEncodingPairs}
                value={searchParams.keyDeserializer}
              />
            </Label>
          </Box>
          <Label text="Value Deserializer">
            <SingleSelect<PayloadEncoding>
              onChange={(e) => (searchParams.valueDeserializer = e)}
              options={payloadEncodingPairs}
              value={searchParams.valueDeserializer}
            />
          </Label>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button
            colorScheme="red"
            onClick={() => {
              setShowDialog(false);
            }}
          >
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
});

const MessageSearchFilterBar: FC<{ onEdit: (filter: FilterEntry) => void }> = observer(({ onEdit }) => {
  const settings = uiState.topicSettings.searchParams;

  return (
    <GridItem display="flex" gridColumn="-1/1" justifyContent="space-between">
      <Box columnGap="8px" display="inline-flex" flexWrap="wrap" rowGap="2px" width="calc(100% - 200px)">
        {/* Existing Tags List  */}
        {settings.filters?.map((e) => (
          <Tag
            className={e.isActive ? 'filterTag' : 'filterTag filterTagDisabled'}
            key={e.id}
            style={{ userSelect: 'none' }}
          >
            <MdOutlineSettings
              onClick={() => {
                onEdit(e);
              }}
              size={14}
            />
            <TagLabel
              alignItems="center"
              border="0px solid hsl(0 0% 85% / 1)"
              borderWidth="0px 1px"
              display="inline-flex"
              height="100%"
              mx="2"
              onClick={() => (e.isActive = !e.isActive)}
              px="6px"
              textDecoration={e.isActive ? '' : 'line-through'}
            >
              {e.name || e.code || 'New Filter'}
            </TagLabel>
            <TagCloseButton m="0" onClick={() => settings.filters.remove(e)} opacity={1} px="1" />
          </Tag>
        ))}
      </Box>
    </GridItem>
  );
});

const EmptyBadge: FC<{ mode: 'empty' | 'null' }> = ({ mode }) => (
  <Badge variant="inverted">
    <Flex gap={2} verticalAlign="center">
      <MdDoNotDisturb size={16} />
      <Text>
        {
          {
            empty: 'Empty',
            null: 'Null',
          }[mode]
        }
      </Text>
    </Flex>
  </Badge>
);

function renderEmptyIcon(tooltipText?: string) {
  const text = tooltipText || 'Empty';
  return (
    <Tooltip hasArrow label={text} openDelay={1} placement="top">
      <span style={{ opacity: 0.66, marginLeft: '2px' }}>
        <SkipIcon />
      </span>
    </Tooltip>
  );
}

function hasDeleteRecordsPrivilege(allowedActions: TopicAction[] | undefined) {
  // undefined has the same meaning as 'all'
  return !allowedActions || allowedActions.includes('deleteTopicRecords') || allowedActions.includes('all');
}

export function DeleteRecordsMenuItem(
  isCompacted: boolean,
  allowedActions: TopicAction[] | undefined,
  onClick: () => void
) {
  const isEnabled = !isCompacted && hasDeleteRecordsPrivilege(allowedActions) && isSupported(Feature.DeleteRecords);

  let errorText: string | undefined;
  if (isCompacted) {
    errorText = "Records on Topics with the 'compact' cleanup policy cannot be deleted.";
  } else if (!hasDeleteRecordsPrivilege(allowedActions)) {
    errorText = "You're not permitted to delete records on this topic.";
  } else if (!isSupported(Feature.DeleteRecords)) {
    errorText = "The cluster doesn't support deleting records.";
  }

  let content: JSX.Element | string = 'Delete Records';
  if (errorText) {
    content = (
      <Tooltip hasArrow label={errorText} placement="top">
        {content}
      </Tooltip>
    );
  }

  return (
    <Button isDisabled={!isEnabled} onClick={onClick} variant="outline">
      {content}
    </Button>
  );
}

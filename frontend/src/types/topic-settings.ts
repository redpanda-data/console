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

import type { SortingState } from '@tanstack/react-table';
import { z } from 'zod';

import { CompressionType, PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import { isObject, isPresent, isUnknownArray } from '../utils/type-guards';
import { randomId } from '../utils/utils';

/** Row density for the messages table: `detailed` adds a deserializer badge and byte size under key/value cells. */
export type RowDensity = 'compact' | 'detailed';

/** One entry per message-table column; array order is display order. */
export type MessageColumnConfig = {
  id: DataColumnKey;
  visible: boolean;
};

export const DEFAULT_MESSAGE_COLUMNS: MessageColumnConfig[] = [
  { id: 'timestamp', visible: true },
  { id: 'partitionID', visible: false },
  { id: 'offset', visible: false },
  { id: 'key', visible: true },
  { id: 'value', visible: true },
  { id: 'keySize', visible: false },
  { id: 'valueSize', visible: false },
];

export const DEFAULT_ROW_DENSITY: RowDensity = 'detailed';

export type PreviewTag = {
  id: string;

  isActive: boolean;
  text: string;
  customName?: string;
};

export type PreviewTagV2 = {
  id: string;

  isActive: boolean;

  pattern: string; // pattern, upgrade from old "text" prop
  customName?: string;

  searchInMessageHeaders: boolean;
  searchInMessageKey: boolean;
  searchInMessageValue: boolean;
};

export type DataColumnKey = 'offset' | 'partitionID' | 'timestamp' | 'key' | 'value' | 'keySize' | 'valueSize';

export type ColumnList = {
  title: string;
  dataIndex: DataColumnKey;
};

export type FilterType = 'code';

export type FilterEntry = {
  isNew: boolean;
  id: string; // used as react key
  filterType: FilterType;
  isActive: boolean;

  // Code
  name: string; // name of the filter, shown instead of the code when set
  transpiledCode: string;
  code: string; // js code the user entered
};

// Factory function to create FilterEntry instances
export function createFilterEntry(overrides?: Partial<FilterEntry>): FilterEntry {
  return {
    isNew: false,
    id: randomId() + randomId(),
    filterType: 'code',
    isActive: true,
    name: '',
    transpiledCode: 'return true;\n',
    code: 'return true\n//allow all messages',
    ...overrides,
  };
}

export type TimestampDisplayFormat = 'default' | 'unixTimestamp' | 'onlyDate' | 'onlyTime' | 'unixMillis' | 'relative';
export function IsLocalTimestampFormat(timestampType: TimestampDisplayFormat) {
  switch (timestampType) {
    case 'default':
      return true; // 'localDateTime'
    case 'onlyDate':
      return true;
    case 'onlyTime':
      return true;
    case 'relative':
      return true;
    case 'unixTimestamp':
      return false;
    case 'unixMillis':
      return false;
    default:
      return true;
  }
}

export const PartitionOffsetOrigin = {
  EndMinusResults: -1,
  Start: -2,
  End: -3,
  Timestamp: -4,
  Custom: 0,
} as const;

export type PartitionOffsetOriginType = (typeof PartitionOffsetOrigin)[keyof typeof PartitionOffsetOrigin];

export type TopicSearchParams = {
  offsetOrigin: PartitionOffsetOriginType;
  startOffset: number;
  startTimestamp: number;
  startTimestampWasSetByUser: boolean;
  partitionID: number;
  maxResults: number;
  continuousPaginationEnabled: boolean;
  page: number;
  pageSize: number;
  sorting: SortingState;
  quickSearch: string;
  filtersEnabled: boolean;
  filters: FilterEntry[];
  keyDeserializer: PayloadEncoding;
  valueDeserializer: PayloadEncoding;
  schemaContext: string; // '' resolves the topic's context, '.' forces the default.
};

export const DEFAULT_SEARCH_PARAMS: TopicSearchParams = {
  offsetOrigin: -1,
  startOffset: -1,
  startTimestamp: -1,
  startTimestampWasSetByUser: false,
  partitionID: -1,
  maxResults: 50,
  continuousPaginationEnabled: false,
  page: 0,
  pageSize: 10,
  sorting: [],
  quickSearch: '',
  filtersEnabled: false,
  filters: [],
  keyDeserializer: PayloadEncoding.UNSPECIFIED,
  valueDeserializer: PayloadEncoding.UNSPECIFIED,
  schemaContext: '',
};

export type TopicMessageSearchSettings = TopicDetailsSettings['searchParams'];

// Settings for an individual topic
export type TopicDetailsSettings = {
  topicName: string;

  searchParams: TopicSearchParams;

  dynamicFilters: 'partition'[];

  messagesPageSize: number;
  favConfigEntries: string[];

  previewTags: PreviewTagV2[];
  previewTagsCaseSensitive: 'caseSensitive' | 'ignoreCase';

  previewMultiResultMode: 'showOnlyFirst' | 'showAll'; // maybe todo: 'limitTo'|'onlyCount' ?
  previewDisplayMode: 'single' | 'wrap' | 'rows'; // only one line / wrap / seperate line for each result

  // previewResultLimit: 3; // todo
  previewShowEmptyMessages: boolean; // todo: filter out messages that don't match
  showMessageMetadata: boolean;
  showMessageHeaders: boolean;

  searchParametersLocalTimeMode: boolean;
  previewTimestamps: TimestampDisplayFormat;
  previewColumnFields: ColumnList[];

  consumerPageSize: number;
  partitionPageSize: number;
  aclPageSize: number;

  produceRecordEncoding: PayloadEncoding | 'base64';
  produceRecordCompression: CompressionType;

  quickSearch: string;
  rowDensity?: RowDensity;
  messageColumns?: MessageColumnConfig[];
};

// Factory function to create TopicDetailsSettings instances
export function createTopicDetailsSettings(
  topicName: string,
  overrides?: Partial<TopicDetailsSettings>
): TopicDetailsSettings {
  return {
    topicName,
    searchParams: structuredClone(DEFAULT_SEARCH_PARAMS),
    dynamicFilters: [],
    messagesPageSize: 20,
    favConfigEntries: ['cleanup.policy', 'segment.bytes', 'segment.ms'],
    previewTags: [],
    previewTagsCaseSensitive: 'ignoreCase',
    previewMultiResultMode: 'showAll',
    previewDisplayMode: 'wrap',
    previewShowEmptyMessages: true,
    showMessageMetadata: true,
    showMessageHeaders: false,
    searchParametersLocalTimeMode: true,
    previewTimestamps: 'default',
    previewColumnFields: [],
    consumerPageSize: 20,
    partitionPageSize: 20,
    aclPageSize: 20,
    produceRecordEncoding: PayloadEncoding.TEXT,
    produceRecordCompression: CompressionType.SNAPPY,
    quickSearch: '',
    rowDensity: DEFAULT_ROW_DENSITY,
    messageColumns: structuredClone(DEFAULT_MESSAGE_COLUMNS),
    ...overrides,
  };
}

/** Merge validated persisted fields, retaining missing/invalid siblings and replacing arrays atomically. */
export function mergePersistedSettings(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const existing = target[key];
    if (isObject(value) && !isUnknownArray(value) && isObject(existing) && !isUnknownArray(existing)) {
      mergePersistedSettings(existing, value);
    } else {
      target[key] = structuredClone(value);
    }
  }
}

/** A corrupt setting is omitted, not allowed to erase a valid sibling or current preference. */
export const optionalPersistedSetting = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined);
const validEntries = <T extends z.ZodType>(schema: T) =>
  z.array(optionalPersistedSetting(schema)).transform((entries) => entries.filter(isPresent));
const sortingEntry = z.object({ id: z.string(), desc: z.boolean() });
export const persistedSorting = validEntries(sortingEntry);
const columnKey = z.enum(['offset', 'partitionID', 'timestamp', 'key', 'value', 'keySize', 'valueSize']);
const timestampFormat = z.enum(['default', 'unixTimestamp', 'onlyDate', 'onlyTime', 'unixMillis', 'relative']);
const previewTagV2 = z.object({
  id: z.string(),
  isActive: z.boolean(),
  pattern: z.string(),
  customName: optionalPersistedSetting(z.string()),
  searchInMessageHeaders: z.boolean().catch(false),
  searchInMessageKey: z.boolean().catch(false),
  searchInMessageValue: z.boolean().catch(true),
});
const previewTagV1 = z
  .object({
    id: z.string(),
    isActive: z.boolean(),
    text: z.string(),
    customName: optionalPersistedSetting(z.string()),
  })
  .transform(
    (tag): PreviewTagV2 => ({
      id: tag.id,
      isActive: tag.isActive,
      pattern: `**.${tag.text}`,
      customName: tag.customName,
      searchInMessageHeaders: false,
      searchInMessageKey: false,
      searchInMessageValue: true,
    })
  );
const filterEntry = z.object({
  isNew: z.boolean(),
  id: z.string(),
  filterType: z.literal('code'),
  isActive: z.boolean(),
  name: z.string(),
  transpiledCode: z.string(),
  code: z.string(),
});
const searchSettingsPatch = z.looseObject({
  offsetOrigin: optionalPersistedSetting(
    z.union([z.literal(-1), z.literal(-2), z.literal(-3), z.literal(-4), z.literal(0)])
  ),
  startOffset: optionalPersistedSetting(z.number()),
  startTimestamp: optionalPersistedSetting(z.number()),
  startTimestampWasSetByUser: optionalPersistedSetting(z.boolean()),
  partitionID: optionalPersistedSetting(z.number()),
  maxResults: optionalPersistedSetting(z.number()),
  continuousPaginationEnabled: optionalPersistedSetting(z.boolean()),
  page: optionalPersistedSetting(z.number()),
  pageSize: optionalPersistedSetting(z.number()),
  sorting: optionalPersistedSetting(persistedSorting),
  quickSearch: optionalPersistedSetting(z.string()),
  filtersEnabled: optionalPersistedSetting(z.boolean()),
  filters: optionalPersistedSetting(validEntries(filterEntry)),
  keyDeserializer: optionalPersistedSetting(z.enum(PayloadEncoding)),
  valueDeserializer: optionalPersistedSetting(z.enum(PayloadEncoding)),
  schemaContext: optionalPersistedSetting(z.string()),
});
const topicSettingsPatch = z.looseObject({
  topicName: z.string(),
  searchParams: optionalPersistedSetting(searchSettingsPatch),
  dynamicFilters: optionalPersistedSetting(validEntries(z.literal('partition'))),
  messagesPageSize: optionalPersistedSetting(z.number()),
  favConfigEntries: optionalPersistedSetting(validEntries(z.string())),
  previewTags: optionalPersistedSetting(validEntries(z.union([previewTagV1, previewTagV2]))),
  previewTagsCaseSensitive: optionalPersistedSetting(z.enum(['caseSensitive', 'ignoreCase'])),
  previewMultiResultMode: optionalPersistedSetting(z.enum(['showOnlyFirst', 'showAll'])),
  previewDisplayMode: optionalPersistedSetting(z.enum(['single', 'wrap', 'rows'])),
  previewShowEmptyMessages: optionalPersistedSetting(z.boolean()),
  showMessageMetadata: optionalPersistedSetting(z.boolean()),
  showMessageHeaders: optionalPersistedSetting(z.boolean()),
  searchParametersLocalTimeMode: optionalPersistedSetting(z.boolean()),
  previewTimestamps: optionalPersistedSetting(timestampFormat),
  previewColumnFields: optionalPersistedSetting(validEntries(z.object({ title: z.string(), dataIndex: columnKey }))),
  consumerPageSize: optionalPersistedSetting(z.number()),
  partitionPageSize: optionalPersistedSetting(z.number()),
  aclPageSize: optionalPersistedSetting(z.number()),
  produceRecordEncoding: optionalPersistedSetting(z.union([z.enum(PayloadEncoding), z.literal('base64')])),
  produceRecordCompression: optionalPersistedSetting(z.enum(CompressionType)),
  quickSearch: optionalPersistedSetting(z.string()),
  rowDensity: optionalPersistedSetting(z.enum(['compact', 'detailed'])),
  messageColumns: optionalPersistedSetting(validEntries(z.object({ id: columnKey, visible: z.boolean() }))),
});

/** Read one legacy or current topic entry; upgrade v1 tags and fill only missing/corrupt fields. */
export function decodeTopicSettings(value: unknown): TopicDetailsSettings | undefined {
  const parsed = topicSettingsPatch.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  const settings = createTopicDetailsSettings(parsed.data.topicName);
  mergePersistedSettings(settings, parsed.data);
  return settings;
}

export function decodeTopicSettingsList(value: unknown): TopicDetailsSettings[] {
  return isUnknownArray(value)
    ? value.flatMap((entry) => {
        const settings = decodeTopicSettings(entry);
        return settings === undefined ? [] : [settings];
      })
    : [];
}

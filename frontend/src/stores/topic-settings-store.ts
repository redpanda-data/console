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
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import { CompressionType, PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import type {
  ColumnList,
  FilterEntry,
  PartitionOffsetOriginType,
  PreviewTagV2,
  TimestampDisplayFormat,
} from '../state/ui';

/**
 * Search parameters for topic messages
 * Matches the structure from uiSettings-v3 perTopicSettings[].searchParams
 */
export interface TopicSearchParams {
  offsetOrigin: PartitionOffsetOriginType;
  startOffset: number;
  startTimestamp: number;
  startTimestampWasSetByUser: boolean;
  partitionID: number;
  maxResults: number;
  page: number;
  pageSize: number;
  sorting: SortingState;
  quickSearch: string;
  filtersEnabled: boolean;
  filters: FilterEntry[];
  keyDeserializer: PayloadEncoding;
  valueDeserializer: PayloadEncoding;
}

/**
 * Complete topic settings structure
 * Matches the structure from uiSettings-v3 perTopicSettings[]
 */
export interface TopicSettings {
  topicName: string;
  searchParams: TopicSearchParams;
  dynamicFilters: 'partition'[];
  messagesPageSize: number;
  favConfigEntries: string[];
  previewTags: PreviewTagV2[];
  previewTagsCaseSensitive: 'caseSensitive' | 'ignoreCase';
  previewMultiResultMode: 'showOnlyFirst' | 'showAll';
  previewDisplayMode: 'single' | 'wrap' | 'rows';
  previewShowEmptyMessages: boolean;
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
}

export interface TopicSettingsStore {
  // Map of topic name to settings
  perTopicSettings: TopicSettings[];

  // Actions for sorting (most commonly used)
  setSorting: (topicName: string, sorting: SortingState) => void;
  getSorting: (topicName: string) => SortingState;

  // Actions for search params
  setSearchParams: (topicName: string, searchParams: Partial<TopicSearchParams>) => void;
  getSearchParams: (topicName: string) => TopicSearchParams | undefined;

  // Actions for preview tags case sensitivity
  setPreviewTagsCaseSensitive: (topicName: string, caseSensitive: 'caseSensitive' | 'ignoreCase') => void;
  getPreviewTagsCaseSensitive: (topicName: string) => 'caseSensitive' | 'ignoreCase';

  // Actions for preview tags
  setPreviewTags: (topicName: string, tags: PreviewTagV2[]) => void;
  getPreviewTags: (topicName: string) => PreviewTagV2[];

  // Actions for preview multi result mode
  setPreviewMultiResultMode: (topicName: string, mode: 'showOnlyFirst' | 'showAll') => void;
  getPreviewMultiResultMode: (topicName: string) => 'showOnlyFirst' | 'showAll';

  // Actions for preview display mode
  setPreviewDisplayMode: (topicName: string, mode: 'single' | 'wrap' | 'rows') => void;
  getPreviewDisplayMode: (topicName: string) => 'single' | 'wrap' | 'rows';

  // Actions for complete topic settings
  getTopicSettings: (topicName: string) => TopicSettings | undefined;
  setTopicSettings: (topicName: string, settings: Partial<TopicSettings>) => void;

  // Utility actions
  clearTopicSettings: (topicName: string) => void;
  clearAllSettings: () => void;
}

const DEFAULT_SORTING: SortingState = [];

const DEFAULT_SEARCH_PARAMS: TopicSearchParams = {
  offsetOrigin: -1,
  startOffset: -1,
  startTimestamp: -1,
  startTimestampWasSetByUser: false,
  partitionID: -1,
  maxResults: 50,
  page: 0,
  pageSize: 10,
  sorting: [],
  quickSearch: '',
  filtersEnabled: false,
  filters: [],
  keyDeserializer: PayloadEncoding.UNSPECIFIED,
  valueDeserializer: PayloadEncoding.UNSPECIFIED,
};

// Helper function to create default topic settings
const createDefaultTopicSettings = (topicName: string, overrides: Partial<TopicSettings> = {}): TopicSettings => ({
  topicName,
  searchParams: { ...DEFAULT_SEARCH_PARAMS },
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
  ...overrides,
});

export const useTopicSettingsStore = create<TopicSettingsStore>()(
  devtools(
    persist(
      (set, get) => ({
        perTopicSettings: [],

        setSorting: (topicName: string, sorting: SortingState) => {
          set((state) => {
            const existingIndex = state.perTopicSettings.findIndex((t) => t.topicName === topicName);

            if (existingIndex >= 0) {
              const updated = [...state.perTopicSettings];
              updated[existingIndex] = {
                ...updated[existingIndex],
                searchParams: {
                  ...updated[existingIndex].searchParams,
                  sorting,
                },
              };
              return { perTopicSettings: updated };
            }

            // Create new topic settings if it doesn't exist
            return {
              perTopicSettings: [
                ...state.perTopicSettings,
                createDefaultTopicSettings(topicName, {
                  searchParams: {
                    ...DEFAULT_SEARCH_PARAMS,
                    sorting,
                  },
                }),
              ],
            };
          });
        },

        getSorting: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.searchParams.sorting ?? DEFAULT_SORTING;
        },

        setSearchParams: (topicName: string, searchParams: Partial<TopicSearchParams>) => {
          set((state) => {
            const existingIndex = state.perTopicSettings.findIndex((t) => t.topicName === topicName);

            if (existingIndex >= 0) {
              const updated = [...state.perTopicSettings];
              updated[existingIndex] = {
                ...updated[existingIndex],
                searchParams: {
                  ...updated[existingIndex].searchParams,
                  ...searchParams,
                },
              };
              return { perTopicSettings: updated };
            }

            // Create new topic settings if it doesn't exist
            return {
              perTopicSettings: [
                ...state.perTopicSettings,
                createDefaultTopicSettings(topicName, {
                  searchParams: {
                    ...DEFAULT_SEARCH_PARAMS,
                    ...searchParams,
                  },
                }),
              ],
            };
          });
        },

        getSearchParams: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.searchParams;
        },

        setPreviewTagsCaseSensitive: (topicName: string, caseSensitive: 'caseSensitive' | 'ignoreCase') => {
          set((state) => {
            const existingIndex = state.perTopicSettings.findIndex((t) => t.topicName === topicName);

            if (existingIndex >= 0) {
              const updated = [...state.perTopicSettings];
              updated[existingIndex] = {
                ...updated[existingIndex],
                previewTagsCaseSensitive: caseSensitive,
              };
              return { perTopicSettings: updated };
            }

            // Create new topic settings if it doesn't exist
            return {
              perTopicSettings: [
                ...state.perTopicSettings,
                createDefaultTopicSettings(topicName, { previewTagsCaseSensitive: caseSensitive }),
              ],
            };
          });
        },

        getPreviewTagsCaseSensitive: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.previewTagsCaseSensitive ?? 'ignoreCase';
        },

        setPreviewTags: (topicName: string, tags: PreviewTagV2[]) => {
          set((state) => {
            const existingIndex = state.perTopicSettings.findIndex((t) => t.topicName === topicName);

            if (existingIndex >= 0) {
              const updated = [...state.perTopicSettings];
              updated[existingIndex] = {
                ...updated[existingIndex],
                previewTags: tags,
              };
              return { perTopicSettings: updated };
            }

            // Create new topic settings if it doesn't exist
            return {
              perTopicSettings: [
                ...state.perTopicSettings,
                createDefaultTopicSettings(topicName, { previewTags: tags }),
              ],
            };
          });
        },

        getPreviewTags: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.previewTags ?? [];
        },

        setPreviewMultiResultMode: (topicName: string, mode: 'showOnlyFirst' | 'showAll') => {
          set((state) => {
            const existingIndex = state.perTopicSettings.findIndex((t) => t.topicName === topicName);

            if (existingIndex >= 0) {
              const updated = [...state.perTopicSettings];
              updated[existingIndex] = {
                ...updated[existingIndex],
                previewMultiResultMode: mode,
              };
              return { perTopicSettings: updated };
            }

            // Create new topic settings if it doesn't exist
            return {
              perTopicSettings: [
                ...state.perTopicSettings,
                createDefaultTopicSettings(topicName, { previewMultiResultMode: mode }),
              ],
            };
          });
        },

        getPreviewMultiResultMode: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.previewMultiResultMode ?? 'showAll';
        },

        setPreviewDisplayMode: (topicName: string, mode: 'single' | 'wrap' | 'rows') => {
          set((state) => {
            const existingIndex = state.perTopicSettings.findIndex((t) => t.topicName === topicName);

            if (existingIndex >= 0) {
              const updated = [...state.perTopicSettings];
              updated[existingIndex] = {
                ...updated[existingIndex],
                previewDisplayMode: mode,
              };
              return { perTopicSettings: updated };
            }

            // Create new topic settings if it doesn't exist
            return {
              perTopicSettings: [
                ...state.perTopicSettings,
                createDefaultTopicSettings(topicName, { previewDisplayMode: mode }),
              ],
            };
          });
        },

        getPreviewDisplayMode: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.previewDisplayMode ?? 'wrap';
        },

        getTopicSettings: (topicName: string) => get().perTopicSettings.find((t) => t.topicName === topicName),

        setTopicSettings: (topicName: string, settings: Partial<TopicSettings>) => {
          set((state) => {
            const existingIndex = state.perTopicSettings.findIndex((t) => t.topicName === topicName);

            if (existingIndex >= 0) {
              const updated = [...state.perTopicSettings];
              updated[existingIndex] = {
                ...updated[existingIndex],
                ...settings,
                topicName, // Ensure topicName is not overwritten
              };
              return { perTopicSettings: updated };
            }

            // Create new topic settings if it doesn't exist
            return { perTopicSettings: [...state.perTopicSettings, createDefaultTopicSettings(topicName, settings)] };
          });
        },

        clearTopicSettings: (topicName: string) => {
          set((state) => ({
            perTopicSettings: state.perTopicSettings.filter((t) => t.topicName !== topicName),
          }));
        },

        clearAllSettings: () => {
          set({ perTopicSettings: [] });
        },
      }),
      {
        name: 'uiSettings-v3',
        version: 1,
        // Custom storage to read/write only perTopicSettings from the full uiSettings-v3 object
        storage: {
          getItem: (name) => {
            const str = localStorage.getItem(name);
            if (!str) {
              return null;
            }

            try {
              const fullSettings = JSON.parse(str);
              // Return only the perTopicSettings part
              if (fullSettings && Array.isArray(fullSettings.perTopicSettings)) {
                return {
                  state: {
                    perTopicSettings: fullSettings.perTopicSettings,
                  },
                  version: 1,
                };
              }
            } catch (error) {
              // biome-ignore lint/suspicious/noConsole: intentional console usage for debugging
              console.warn('Error parsing uiSettings-v3:', error);
            }

            return null;
          },
          setItem: (name, value) => {
            // Read existing settings
            const existingStr = localStorage.getItem(name);
            let fullSettings: Record<string, unknown> = {};

            if (existingStr) {
              try {
                fullSettings = JSON.parse(existingStr);
              } catch {
                // If parsing fails, start with empty object
                fullSettings = {};
              }
            }

            // Merge our perTopicSettings into the full settings
            fullSettings.perTopicSettings = value.state.perTopicSettings;

            // Save the merged settings
            localStorage.setItem(name, JSON.stringify(fullSettings));
          },
          removeItem: (name) => {
            localStorage.removeItem(name);
          },
        },
      }
    )
  )
);

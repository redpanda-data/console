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

import { PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import type { PreviewTagV2 } from '../state/ui';
import { uiSettings } from '../state/ui';
import {
  createTopicDetailsSettings as createDefaultTopicSettings,
  DEFAULT_MESSAGE_COLUMNS,
  DEFAULT_ROW_DENSITY,
  decodeTopicSettingsList,
  type MessageColumnConfig,
  type RowDensity,
  type TopicDetailsSettings,
  type TopicSearchParams,
} from '../types/topic-settings';
import { isObject, isUnknownArray } from '../utils/type-guards';

export type { MessageColumnConfig, RowDensity, TopicSearchParams } from '../types/topic-settings';
export type TopicSettings = TopicDetailsSettings;

export type TopicSettingsStore = {
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

  // Actions for the messages-table view settings (new messages UX)
  setRowDensity: (topicName: string, density: RowDensity) => void;
  getRowDensity: (topicName: string) => RowDensity;
  setMessageColumns: (topicName: string, columns: MessageColumnConfig[]) => void;
  getMessageColumns: (topicName: string) => MessageColumnConfig[];
  resetViewSettings: (topicName: string) => void;

  // Actions for complete topic settings
  getTopicSettings: (topicName: string) => TopicSettings | undefined;
  setTopicSettings: (topicName: string, settings: Partial<TopicSettings>) => void;

  // Utility actions
  clearTopicSettings: (topicName: string) => void;
  clearAllSettings: () => void;
};

// Default display order for the message list: newest-first by timestamp, with
// offset descending as a cross-partition tiebreak (offset isn't global across
// partitions, so timestamp is the primary key). The backend's listMessages
// stream isn't globally timestamp-sorted across partitions, so this default
// drives the table's client-side sort to give users a sensible newest-first view.
export const DEFAULT_SORTING: SortingState = [
  { id: 'timestamp', desc: true },
  { id: 'offset', desc: true },
];

/**
 * Cap on retained per-topic settings. This persisted store appends one entry per distinct topic
 * that gets any setting changed (sort, preview, …) and the persist middleware serializes the whole
 * array, so a long session touching many topics would grow heap + storage without bound. Oldest-added
 * entries are dropped first (FIFO; a dropped topic re-creates defaults on next access). Mirrors the
 * cap on the `setCurrentTopicName` path in `state/ui-state.ts`.
 */
export const MAX_PER_TOPIC_SETTINGS = 200;

/**
 * Subscribe to Zustand store changes and sync them to the legacy MobX uiSettings store.
 * This ensures that changes made via Zustand are persisted by MobX's autorun mechanism.
 */
const syncPerTopicSettingsToMobX = (state: TopicSettingsStore) => {
  // Both stores share the same decoded topic-settings contract.
  uiSettings.perTopicSettings = state.perTopicSettings;
};

/** Update the first retained topic entry in place in display order, or append fresh independent defaults. */
function updateTopicEntry(
  topics: TopicSettings[],
  topicName: string,
  update: (topic: TopicSettings) => TopicSettings
): TopicSettings[] {
  const index = topics.findIndex((topic) => topic.topicName === topicName);
  const next = update(topics[index] ?? createDefaultTopicSettings(topicName));
  return index < 0 ? [...topics, next] : topics.map((topic, current) => (current === index ? next : topic));
}

export const useTopicSettingsStore = create<TopicSettingsStore>()(
  devtools(
    persist(
      (set, get) => ({
        perTopicSettings: [],

        setSorting: (topicName, sorting) => get().setSearchParams(topicName, { sorting }),

        getSorting: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          const sorting = topic?.searchParams.sorting;
          // Treat an empty/unset sort as "use the newest-first default" so the
          // default applies on every fresh load, including returning users whose
          // persisted settings still hold the old empty sort.
          return sorting && sorting.length > 0 ? sorting : structuredClone(DEFAULT_SORTING);
        },

        setSearchParams: (topicName, searchParams) => {
          set((state) => ({
            perTopicSettings: updateTopicEntry(state.perTopicSettings, topicName, (topic) => ({
              ...topic,
              searchParams: { ...topic.searchParams, ...searchParams },
            })),
          }));
        },

        getSearchParams: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.searchParams;
        },

        setPreviewTagsCaseSensitive: (topicName, caseSensitive) =>
          get().setTopicSettings(topicName, { previewTagsCaseSensitive: caseSensitive }),

        getPreviewTagsCaseSensitive: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.previewTagsCaseSensitive ?? 'ignoreCase';
        },

        setPreviewTags: (topicName, tags) => get().setTopicSettings(topicName, { previewTags: tags }),

        getPreviewTags: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.previewTags ?? [];
        },

        setPreviewMultiResultMode: (topicName, mode) =>
          get().setTopicSettings(topicName, { previewMultiResultMode: mode }),

        getPreviewMultiResultMode: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.previewMultiResultMode ?? 'showAll';
        },

        setPreviewDisplayMode: (topicName, mode) => get().setTopicSettings(topicName, { previewDisplayMode: mode }),

        getPreviewDisplayMode: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.previewDisplayMode ?? 'wrap';
        },

        setRowDensity: (topicName: string, density: RowDensity) => {
          get().setTopicSettings(topicName, { rowDensity: density });
        },

        getRowDensity: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          return topic?.rowDensity ?? DEFAULT_ROW_DENSITY;
        },

        setMessageColumns: (topicName: string, columns: MessageColumnConfig[]) => {
          get().setTopicSettings(topicName, { messageColumns: columns });
        },

        getMessageColumns: (topicName: string) => {
          const topic = get().perTopicSettings.find((t) => t.topicName === topicName);
          const columns = topic?.messageColumns;
          if (!columns || columns.length === 0) {
            return structuredClone(DEFAULT_MESSAGE_COLUMNS);
          }
          // Heal entries corrupted by the legacy assignDeep array merge (which
          // duplicated some column ids and dropped others): keep the first
          // occurrence of each id and restore any missing columns.
          const seen = new Set<MessageColumnConfig['id']>();
          const unique = columns.filter((c) => {
            if (seen.has(c.id)) {
              return false;
            }
            seen.add(c.id);
            return true;
          });
          const missing = structuredClone(DEFAULT_MESSAGE_COLUMNS).filter((d) => !seen.has(d.id));
          return unique.length === columns.length && missing.length === 0 ? columns : [...unique, ...missing];
        },

        resetViewSettings: (topicName: string) => {
          get().setTopicSettings(topicName, {
            rowDensity: DEFAULT_ROW_DENSITY,
            messageColumns: structuredClone(DEFAULT_MESSAGE_COLUMNS),
            previewTags: [],
            previewTagsCaseSensitive: 'ignoreCase',
            previewMultiResultMode: 'showAll',
            previewDisplayMode: 'single',
            previewTimestamps: 'default',
          });
          const searchParams = get().getSearchParams(topicName);
          if (
            searchParams &&
            (searchParams.keyDeserializer !== PayloadEncoding.UNSPECIFIED ||
              searchParams.valueDeserializer !== PayloadEncoding.UNSPECIFIED)
          ) {
            get().setSearchParams(topicName, {
              keyDeserializer: PayloadEncoding.UNSPECIFIED,
              valueDeserializer: PayloadEncoding.UNSPECIFIED,
            });
          }
        },

        getTopicSettings: (topicName: string) => get().perTopicSettings.find((t) => t.topicName === topicName),

        setTopicSettings: (topicName, settings) => {
          set((state) => ({
            perTopicSettings: updateTopicEntry(state.perTopicSettings, topicName, (topic) => ({
              ...topic,
              ...settings,
              topicName,
            })),
          }));
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
            if (!(str !== null && str !== undefined && str !== '')) {
              return null;
            }

            try {
              const fullSettings: unknown = JSON.parse(str);
              // Return only the perTopicSettings part
              if (isObject(fullSettings) && isUnknownArray(fullSettings.perTopicSettings)) {
                return {
                  state: {
                    perTopicSettings: decodeTopicSettingsList(fullSettings.perTopicSettings),
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

            if (existingStr !== null && existingStr !== undefined && existingStr !== '') {
              try {
                const parsed: unknown = JSON.parse(existingStr);
                fullSettings = isObject(parsed) && !isUnknownArray(parsed) ? parsed : {};
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

// Subscribe to Zustand store changes and sync them to MobX
// This ensures that changes made via Zustand are also reflected in the legacy MobX store
// and persisted by MobX's autorun mechanism
useTopicSettingsStore.subscribe(syncPerTopicSettingsToMobX);

// Enforce the perTopicSettings cap on every change. Registered after the MobX sync so that the
// sync re-run (triggered by this trim's setState) ends up mirroring the trimmed array. The length
// guard makes the re-entrant setState terminate immediately (the trimmed array is within the cap).
useTopicSettingsStore.subscribe((state) => {
  if (state.perTopicSettings.length > MAX_PER_TOPIC_SETTINGS) {
    useTopicSettingsStore.setState({
      perTopicSettings: state.perTopicSettings.slice(-MAX_PER_TOPIC_SETTINGS),
    });
  }
});

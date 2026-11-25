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

import { installUISettingsSideEffects, useUISettingsStore } from '../state/ui';
import { createTopicDetailsSettings, decodeTopicSettings } from '../types/topic-settings';
import { decodeUiSettings } from '../types/ui-settings';
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

import { MAX_PER_TOPIC_SETTINGS, useTopicSettingsStore } from './topic-settings-store';
import { beforeEach, describe, expect, test } from 'bun:test';
import { PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import { DEFAULT_MESSAGE_COLUMNS, DEFAULT_ROW_DENSITY } from '../types/topic-settings';
import { compareStrings } from '../utils/string-utils';

describe('useTopicSettingsStore perTopicSettings cap', () => {
  beforeEach(() => {
    useTopicSettingsStore.setState({ perTopicSettings: [] });
  });

  test('bounds perTopicSettings to MAX_PER_TOPIC_SETTINGS, dropping the oldest-added entries', () => {
    const total = MAX_PER_TOPIC_SETTINGS + 5;
    for (let i = 0; i < total; i++) {
      useTopicSettingsStore.getState().setSorting(`topic-${i}`, []);
    }

    const settings = useTopicSettingsStore.getState().perTopicSettings;
    expect(settings).toHaveLength(MAX_PER_TOPIC_SETTINGS);
    // oldest-added dropped, newest kept
    expect(settings.some((t) => t.topicName === 'topic-0')).toBe(false);
    expect(settings.some((t) => t.topicName === `topic-${total - 1}`)).toBe(true);
  });
});

describe('useTopicSettingsStore messages view settings', () => {
  beforeEach(() => {
    useTopicSettingsStore.setState({ perTopicSettings: [] });
  });

  test('getRowDensity falls back to the default for unknown topics and entries persisted without the field', () => {
    const store = useTopicSettingsStore.getState();
    expect(store.getRowDensity('unknown-topic')).toBe(DEFAULT_ROW_DENSITY);

    // Simulate an entry persisted before rowDensity existed
    store.setSorting('old-topic', []);
    expect(useTopicSettingsStore.getState().getRowDensity('old-topic')).toBe(DEFAULT_ROW_DENSITY);
  });

  test('setRowDensity persists per topic', () => {
    useTopicSettingsStore.getState().setRowDensity('topic-a', 'compact');
    expect(useTopicSettingsStore.getState().getRowDensity('topic-a')).toBe('compact');
    expect(useTopicSettingsStore.getState().getRowDensity('topic-b')).toBe(DEFAULT_ROW_DENSITY);
  });

  test('getMessageColumns falls back to defaults when unset or empty', () => {
    const store = useTopicSettingsStore.getState();
    expect(store.getMessageColumns('unknown-topic')).toStrictEqual(DEFAULT_MESSAGE_COLUMNS);

    store.setMessageColumns('topic-a', []);
    expect(useTopicSettingsStore.getState().getMessageColumns('topic-a')).toStrictEqual(DEFAULT_MESSAGE_COLUMNS);
  });

  test('setMessageColumns stores order and visibility; missing columns are restored on read', () => {
    const columns = [
      { id: 'offset' as const, visible: true },
      { id: 'value' as const, visible: false },
    ];
    useTopicSettingsStore.getState().setMessageColumns('topic-a', columns);
    const result = useTopicSettingsStore.getState().getMessageColumns('topic-a');
    expect(result.slice(0, 2)).toStrictEqual(columns);
    // columns absent from the stored value come back so they stay reachable in settings
    expect(result.map((c) => c.id).sort(compareStrings)).toStrictEqual(
      DEFAULT_MESSAGE_COLUMNS.map((c) => c.id).sort(compareStrings)
    );
  });

  test('getMessageColumns heals persisted duplicates and restores lost columns', () => {
    useTopicSettingsStore.getState().setMessageColumns('topic-a', [
      { id: 'offset', visible: true },
      { id: 'offset', visible: false },
      { id: 'key', visible: true },
    ]);
    const ids = useTopicSettingsStore
      .getState()
      .getMessageColumns('topic-a')
      .map((c) => c.id);
    // first occurrences kept in order, missing defaults appended
    expect(ids.slice(0, 2)).toStrictEqual(['offset', 'key']);
    expect(new Set(ids).size).toBe(DEFAULT_MESSAGE_COLUMNS.length);
  });

  test('repeated column reorders survive the legacy uiSettings sync without duplication', () => {
    // Regression: every store change syncs into the legacy uiSettings store via
    // assignDeep. When that merged arrays index-by-index it mutated the shared
    // column objects in place, so the second reorder duplicated one column id
    // and lost another (drag'n'drop in view settings produced two "offset" rows).
    const store = useTopicSettingsStore.getState();
    store.setMessageColumns('topic-a', [...DEFAULT_MESSAGE_COLUMNS]);

    for (let i = 0; i < 5; i++) {
      const current = useTopicSettingsStore.getState().getMessageColumns('topic-a');
      useTopicSettingsStore.getState().setMessageColumns('topic-a', moveFirstColumn(current));

      const ids = useTopicSettingsStore
        .getState()
        .getMessageColumns('topic-a')
        .map((c) => c.id);
      expect(new Set(ids).size).toBe(DEFAULT_MESSAGE_COLUMNS.length);
      expect(ids).toHaveLength(DEFAULT_MESSAGE_COLUMNS.length);
    }
  });

  test('resetViewSettings restores view defaults including deserializers', () => {
    const store = useTopicSettingsStore.getState();
    configureCustomMessageView(store);

    useTopicSettingsStore.getState().resetViewSettings('topic-a');

    const state = useTopicSettingsStore.getState();
    expect(state.getRowDensity('topic-a')).toBe(DEFAULT_ROW_DENSITY);
    expect(state.getMessageColumns('topic-a')).toStrictEqual(DEFAULT_MESSAGE_COLUMNS);
    expect(state.getPreviewTags('topic-a')).toStrictEqual([]);
    expect(state.getSearchParams('topic-a')?.keyDeserializer).toBe(PayloadEncoding.UNSPECIFIED);
    expect(state.getSearchParams('topic-a')?.valueDeserializer).toBe(PayloadEncoding.UNSPECIFIED);
  });
});

function moveFirstColumn(current: ReturnType<ReturnType<typeof useTopicSettingsStore.getState>['getMessageColumns']>) {
  const next = [...current];
  const moved = next.shift();
  if (moved === undefined) {
    throw new Error('Cannot reorder an empty column list');
  }
  next.splice(3, 0, moved);
  return next;
}

function configureCustomMessageView(store: ReturnType<typeof useTopicSettingsStore.getState>) {
  store.setRowDensity('topic-a', 'compact');
  store.setMessageColumns('topic-a', [{ id: 'offset', visible: true }]);
  store.setPreviewTags('topic-a', [
    {
      id: '1',
      isActive: true,
      pattern: 'a.*',
      searchInMessageHeaders: false,
      searchInMessageKey: false,
      searchInMessageValue: true,
    },
  ]);
  store.setSearchParams('topic-a', {
    keyDeserializer: PayloadEncoding.AVRO,
    valueDeserializer: PayloadEncoding.JSON,
  });
}

describe('persisted topic and global preferences', () => {
  test('upgrades partial v1 topic entries without losing current view preferences', () => {
    const topic = decodeTopicSettings({
      topicName: 'legacy',
      searchParams: { pageSize: 37 },
      rowDensity: 'compact',
      messageColumns: [{ id: 'key', visible: false }],
      previewTags: [{ id: 'old-tag', text: 'customer.id', isActive: true }],
    });
    expect(topic?.searchParams.pageSize).toBe(37);
    expect(topic?.searchParams.continuousPaginationEnabled).toBe(false);
    expect(topic?.previewTags).toStrictEqual([
      {
        id: 'old-tag',
        isActive: true,
        pattern: '**.customer.id',
        customName: undefined,
        searchInMessageHeaders: false,
        searchInMessageKey: false,
        searchInMessageValue: true,
      },
    ]);
    expect(topic?.rowDensity).toBe('compact');
    expect(topic?.messageColumns).toStrictEqual([{ id: 'key', visible: false }]);
  });

  test('rejects malformed roots and topic entries instead of asserting their shape', () => {
    expect(decodeUiSettings([])).toBeUndefined();
    expect(decodeUiSettings(null)).toBeUndefined();
    expect(decodeTopicSettings({ topicName: 10 })).toBeUndefined();
  });

  test('keeps valid settings and current siblings when one persisted leaf is malformed', () => {
    const base = decodeUiSettings({ brokerList: { pageSize: 73 }, kafkaConnect: { tasks: { pageSize: 42 } } });
    const decoded = decodeUiSettings(
      { brokerList: { quickSearch: 'brokers', pageSize: 'broken' }, kafkaConnect: { tasks: { quickSearch: 'tasks' } } },
      base
    );
    expect(decoded?.brokerList.pageSize).toBe(73);
    expect(decoded?.brokerList.quickSearch).toBe('brokers');
    expect(decoded?.kafkaConnect.tasks).toStrictEqual({ pageSize: 42, quickSearch: 'tasks' });
  });

  test('creates independent mutable defaults for every topic', () => {
    const first = createTopicDetailsSettings('first');
    const second = createTopicDetailsSettings('second');
    first.searchParams.sorting.push({ id: 'key', desc: false });
    const column = first.messageColumns?.[0];
    if (!column) {
      throw new Error('Expected a default message column');
    }
    column.visible = false;
    expect(second.searchParams.sorting).toStrictEqual([]);
    expect(second.messageColumns?.[0]?.visible).toBe(true);
  });

  test('hydrates both stores with the same upgraded topic contract and preserves global settings on save', async () => {
    localStorage.setItem(
      'uiSettings-v3',
      JSON.stringify({
        brokerList: { quickSearch: 'retained' },
        perTopicSettings: [
          { topicName: 'old', searchParams: { continuousPaginationEnabled: true }, rowDensity: 'compact' },
        ],
      })
    );
    // Match startup: the topic store imports (and therefore initializes) the legacy UI store first.
    await useUISettingsStore.persist.rehydrate();
    await useTopicSettingsStore.persist.rehydrate();
    expect(useTopicSettingsStore.getState().getSearchParams('old')?.continuousPaginationEnabled).toBe(true);
    expect(useUISettingsStore.getState().perTopicSettings[0]?.searchParams.continuousPaginationEnabled).toBe(true);
    useTopicSettingsStore.getState().setRowDensity('old', 'detailed');
    const saved = decodeUiSettings(JSON.parse(localStorage.getItem('uiSettings-v3') ?? '{}'));
    expect(saved?.brokerList.quickSearch).toBe('retained');
    expect(saved?.perTopicSettings[0]?.rowDensity).toBe('detailed');
  });

  test('cross-tab partial updates retain unrelated current preferences', () => {
    useUISettingsStore.getState().updateSettings({
      brokerList: {
        hideEmptyColumns: false,
        pageSize: 64,
        quickSearch: 'before',
        valueDisplay: 'raw',
        propsFilter: 'all',
        propsOrder: 'default',
        configTable: { pageSize: 80, quickSearch: 'config' },
      },
    });
    const uninstall = installUISettingsSideEffects();
    try {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'uiSettings-v3',
          newValue: JSON.stringify({ brokerList: { quickSearch: 'from another tab' } }),
        })
      );
      expect(useUISettingsStore.getState().brokerList.quickSearch).toBe('from another tab');
      expect(useUISettingsStore.getState().brokerList.pageSize).toBe(64);
      expect(useUISettingsStore.getState().brokerList.configTable.pageSize).toBe(80);
    } finally {
      uninstall();
    }
  });
});

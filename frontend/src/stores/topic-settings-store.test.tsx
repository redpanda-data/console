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

import { beforeEach, describe, expect, test } from 'vitest';

import {
  DEFAULT_MESSAGE_COLUMNS,
  DEFAULT_ROW_DENSITY,
  MAX_PER_TOPIC_SETTINGS,
  useTopicSettingsStore,
} from './topic-settings-store';
import { PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';

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
    expect(store.getMessageColumns('unknown-topic')).toEqual(DEFAULT_MESSAGE_COLUMNS);

    store.setMessageColumns('topic-a', []);
    expect(useTopicSettingsStore.getState().getMessageColumns('topic-a')).toEqual(DEFAULT_MESSAGE_COLUMNS);
  });

  test('setMessageColumns stores order and visibility; missing columns are restored on read', () => {
    const columns = [
      { id: 'offset' as const, visible: true },
      { id: 'value' as const, visible: false },
    ];
    useTopicSettingsStore.getState().setMessageColumns('topic-a', columns);
    const result = useTopicSettingsStore.getState().getMessageColumns('topic-a');
    expect(result.slice(0, 2)).toEqual(columns);
    // columns absent from the stored value come back so they stay reachable in settings
    expect(result.map((c) => c.id).sort()).toEqual(DEFAULT_MESSAGE_COLUMNS.map((c) => c.id).sort());
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
    expect(ids.slice(0, 2)).toEqual(['offset', 'key']);
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
      const next = [...current];
      const [moved] = next.splice(0, 1);
      next.splice(3, 0, moved);
      useTopicSettingsStore.getState().setMessageColumns('topic-a', next);

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

    useTopicSettingsStore.getState().resetViewSettings('topic-a');

    const state = useTopicSettingsStore.getState();
    expect(state.getRowDensity('topic-a')).toBe(DEFAULT_ROW_DENSITY);
    expect(state.getMessageColumns('topic-a')).toEqual(DEFAULT_MESSAGE_COLUMNS);
    expect(state.getPreviewTags('topic-a')).toEqual([]);
    expect(state.getSearchParams('topic-a')?.keyDeserializer).toBe(PayloadEncoding.UNSPECIFIED);
    expect(state.getSearchParams('topic-a')?.valueDeserializer).toBe(PayloadEncoding.UNSPECIFIED);
  });
});

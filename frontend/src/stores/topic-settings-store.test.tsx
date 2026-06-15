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

import { MAX_PER_TOPIC_SETTINGS, useTopicSettingsStore } from './topic-settings-store';

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

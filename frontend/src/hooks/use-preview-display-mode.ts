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

import { parseAsStringLiteral } from 'nuqs';

import { useQueryStateWithCallback } from './use-query-state-with-callback';
import { useTopicSettingsStore } from '../stores/topic-settings-store';

/**
 * Hook for managing preview display mode with URL state and localStorage persistence
 * Syncs between URL query params and Zustand store
 */
export function usePreviewDisplayMode(topicName: string) {
  const { setPreviewDisplayMode, getPreviewDisplayMode } = useTopicSettingsStore();

  const [displayMode, setDisplayMode] = useQueryStateWithCallback<'single' | 'wrap' | 'rows'>(
    {
      onUpdate: (val) => {
        setPreviewDisplayMode(topicName, val);
      },
      getDefaultValue: () => getPreviewDisplayMode(topicName),
    },
    'displayMode',
    parseAsStringLiteral(['single', 'wrap', 'rows'] as const).withDefault('wrap')
  );

  return [displayMode, setDisplayMode] as const;
}

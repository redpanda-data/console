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
 * Hook for managing preview multi result mode with URL state and localStorage persistence
 * Syncs between URL query params and Zustand store
 */
export function usePreviewMultiResultMode(topicName: string) {
  const { setPreviewMultiResultMode, getPreviewMultiResultMode } = useTopicSettingsStore();

  const [multiResultMode, setMultiResultMode] = useQueryStateWithCallback<'showOnlyFirst' | 'showAll'>(
    {
      onUpdate: (val) => {
        setPreviewMultiResultMode(topicName, val);
      },
      getDefaultValue: () => getPreviewMultiResultMode(topicName),
    },
    'multiResult',
    parseAsStringLiteral(['showOnlyFirst', 'showAll'] as const).withDefault('showAll')
  );

  return [multiResultMode, setMultiResultMode] as const;
}

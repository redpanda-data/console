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
import { uiState } from '../state/ui-state';
import { useTopicSettingsStore } from '../stores/topic-settings-store';

/**
 * Hook for managing preview tags case sensitivity with URL state and localStorage persistence
 * Syncs between URL query params, Zustand store, and MobX (for backward compatibility)
 */
export function usePreviewTagsCaseSensitive(topicName: string) {
  const { setPreviewTagsCaseSensitive, getPreviewTagsCaseSensitive } = useTopicSettingsStore();

  const [caseSensitive, setCaseSensitive] = useQueryStateWithCallback<'caseSensitive' | 'ignoreCase'>(
    {
      onUpdate: (val) => {
        setPreviewTagsCaseSensitive(topicName, val);
        // Keep MobX state in sync for backward compatibility
        uiState.topicSettings.previewTagsCaseSensitive = val;
      },
      getDefaultValue: () => getPreviewTagsCaseSensitive(topicName),
    },
    'caseSensitive',
    parseAsStringLiteral(['caseSensitive', 'ignoreCase'] as const).withDefault('ignoreCase')
  );

  return [caseSensitive, setCaseSensitive] as const;
}

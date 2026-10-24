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

import clsx from 'clsx';
import type { ReactNode } from 'react';

import type { PreviewTagV2 } from '../../../../../state/ui';
import { uiState } from '../../../../../state/ui-state';
import { getPreviewTags } from '../preview-settings';

export type PreviewDisplayMode = 'single' | 'wrap' | 'rows';

/**
 * The preview tags found in an object payload, laid out for a table cell. Returns `null` when no
 * preview tag searches the payload, so the caller falls back to its plain preview.
 */
export function renderPreviewTags(
  payload: unknown,
  previewFields: () => PreviewTagV2[],
  previewDisplayMode?: PreviewDisplayMode
): ReactNode {
  const previewTags = previewFields().filter((t) => t.searchInMessageValue);
  if (previewTags.length === 0) {
    return null;
  }
  const caseSensitive = uiState.topicSettings.previewTagsCaseSensitive === 'caseSensitive';
  const tags = getPreviewTags(payload as Record<string, unknown>, previewTags, caseSensitive);
  const displayMode = previewDisplayMode ?? uiState.topicSettings.previewDisplayMode;
  return (
    <span className="cellDiv fade" style={{ fontSize: '95%' }}>
      <div
        className={clsx('previewTags', {
          'previewTags-single': displayMode === 'single',
          'previewTags-wrap': displayMode === 'wrap',
          'previewTags-rows': displayMode === 'rows',
        })}
      >
        {tags}
      </div>
    </span>
  );
}

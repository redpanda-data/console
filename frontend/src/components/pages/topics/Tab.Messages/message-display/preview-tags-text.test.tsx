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

import { render, screen } from '@testing-library/react';

import { renderPreviewTags } from './preview-tags-text';
import type { PreviewTagV2 } from '../../../../../state/ui';

rs.mock('../../../../../state/ui-state', () => ({
  uiState: {
    topicSettings: {
      previewDisplayMode: 'wrap',
      previewTagsCaseSensitive: 'caseInsensitive',
    },
  },
}));

const valueTag: PreviewTagV2 = {
  id: '1',
  isActive: true,
  pattern: 'order.status',
  searchInMessageHeaders: false,
  searchInMessageKey: false,
  searchInMessageValue: true,
};

const payload = { order: { status: 'shipped' } };

describe('renderPreviewTags', () => {
  test('returns null when no preview tag searches the payload', () => {
    expect(renderPreviewTags(payload, () => [{ ...valueTag, searchInMessageValue: false }])).toBeNull();
  });

  test('lists the matched values in the stored display mode', () => {
    render(<>{renderPreviewTags(payload, () => [valueTag])}</>);

    expect(screen.getByText('order.status')).toBeVisible();
    expect(screen.getByText('shipped')).toBeVisible();
    expect(screen.getByText('shipped').closest('.previewTags')).toHaveClass('previewTags-wrap');
  });

  test('prefers the display mode passed by the caller', () => {
    render(<>{renderPreviewTags(payload, () => [valueTag], 'rows')}</>);

    expect(screen.getByText('shipped').closest('.previewTags')).toHaveClass('previewTags-rows');
  });
});

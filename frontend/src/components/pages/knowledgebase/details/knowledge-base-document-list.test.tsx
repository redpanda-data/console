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

import userEvent from '@testing-library/user-event';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    config: {
      clusterId: 'test-cluster',
    },
  };
});

import { KnowledgeBaseDocumentList, type RetrievalResult } from './knowledge-base-document-list';

describe('KnowledgeBaseDocumentList', () => {
  test('should update pagination footer and disable next button on the last page', async () => {
    const user = userEvent.setup();
    const results: RetrievalResult[] = Array.from({ length: 25 }, (_, index) => ({
      score: 0.9 - index * 0.01,
      document_name: `Document ${index + 1}`,
      chunk_id: `chunk-${index + 1}`,
      topic: `topic-${index + 1}`,
      text: `Content ${index + 1}`,
    }));

    renderWithFileRoutes(<KnowledgeBaseDocumentList isLoading={false} knowledgebaseId="kb-1" results={results} />);

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 3')).toBeVisible();
    });

    const previousButton = screen.getByRole('button', { name: 'Previous Page' });
    const nextButton = screen.getByRole('button', { name: 'Next Page' });

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 3')).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Previous Page' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Next Page' }));

    await waitFor(() => {
      expect(screen.getByText('Page 3 of 3')).toBeVisible();
    });

    expect(screen.getByRole('button', { name: 'Next Page' })).toBeDisabled();
  });
});

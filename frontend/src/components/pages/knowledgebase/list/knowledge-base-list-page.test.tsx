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

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import {
  DeleteKnowledgeBaseRequestSchema,
  DeleteKnowledgeBaseResponseSchema,
  KnowledgeBase_EmbeddingGenerator_ProviderSchema,
  KnowledgeBase_EmbeddingGeneratorSchema,
  KnowledgeBase_Retriever_Reranker_Provider_CohereSchema,
  KnowledgeBase_Retriever_Reranker_ProviderSchema,
  KnowledgeBase_Retriever_RerankerSchema,
  KnowledgeBase_RetrieverSchema,
  KnowledgeBaseSchema,
  ListKnowledgeBasesResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import {
  deleteKnowledgeBase,
  listKnowledgeBases,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base-KnowledgeBaseService_connectquery';
import { renderWithFileRoutes, screen, waitFor, within } from 'test-utils';

vi.mock('config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('config')>();
  return {
    ...actual,
    config: {
      jwt: 'test-jwt-token',
    },
    isFeatureFlagEnabled: vi.fn(() => false),
  };
});

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

Element.prototype.scrollIntoView = vi.fn();

import { KnowledgeBaseListPage as KnowledgeBaseList } from './knowledge-base-list-page';

// Hoisted once — 25 rows = 3 pages at the page's hard-coded pageSize of 10.
const PAGINATION_KBS_FIXTURE = Array.from({ length: 25 }, (_, index) =>
  create(KnowledgeBaseSchema, {
    id: `kb-${index + 1}`,
    displayName: `Knowledge Base ${index + 1}`,
    description: `Description ${index + 1}`,
    tags: {},
  })
);

const OPEN_MENU_REGEX = /open menu/i;
const DELETE_CONFIRMATION_REGEX = /you are about to delete/i;
const TYPE_DELETE_REGEX = /type "delete" to confirm/i;
const DELETE_BUTTON_REGEX = /^delete$/i;

describe('KnowledgeBaseList', () => {
  test('should list all knowledge bases', async () => {
    const kb1 = create(KnowledgeBaseSchema, {
      id: 'kb-1',
      displayName: 'Test Knowledge Base 1',
      description: 'Description for KB 1',
      tags: {
        env: 'production',
        team: 'data-science',
      },
    });

    const kb2 = create(KnowledgeBaseSchema, {
      id: 'kb-2',
      displayName: 'Test Knowledge Base 2',
      description: 'Description for KB 2',
      tags: {
        env: 'staging',
      },
    });

    const listKnowledgeBasesResponse = create(ListKnowledgeBasesResponseSchema, {
      knowledgeBases: [kb1, kb2],
      nextPageToken: '',
    });

    const listKnowledgeBasesMock = vi.fn().mockReturnValue(listKnowledgeBasesResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, listKnowledgeBasesMock);
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base 1')).toBeVisible();
      expect(screen.getByText('Test Knowledge Base 2')).toBeVisible();
    });

    expect(listKnowledgeBasesMock).toHaveBeenCalledTimes(1);

    expect(screen.getByText('Description for KB 1')).toBeVisible();
    expect(screen.getByText('Description for KB 2')).toBeVisible();
  });

  test('should navigate to knowledge base details when clicking on row', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'test-kb-123',
      displayName: 'Test Knowledge Base',
      description: 'Test description',
      tags: {},
    });

    const listKnowledgeBasesResponse = create(ListKnowledgeBasesResponseSchema, {
      knowledgeBases: [kb1],
      nextPageToken: '',
    });

    const listKnowledgeBasesMock = vi.fn().mockReturnValue(listKnowledgeBasesResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, listKnowledgeBasesMock);
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base')).toBeVisible();
    });

    const row = screen.getByText('Test Knowledge Base').closest('tr');
    if (row) {
      await user.click(row);
    }
  });

  test('should delete a knowledge base from the list', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'kb-1',
      displayName: 'Test Knowledge Base 1',
      description: 'Description for KB 1',
      tags: {
        env: 'production',
      },
    });

    const listKnowledgeBasesResponse = create(ListKnowledgeBasesResponseSchema, {
      knowledgeBases: [kb1],
      nextPageToken: '',
    });

    const listKnowledgeBasesMock = vi.fn().mockReturnValue(listKnowledgeBasesResponse);
    const deleteKnowledgeBaseMock = vi.fn().mockReturnValue(create(DeleteKnowledgeBaseResponseSchema, {}));

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, listKnowledgeBasesMock);
      rpc(deleteKnowledgeBase, deleteKnowledgeBaseMock);
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base 1')).toBeVisible();
    });

    const rows = screen.getAllByRole('row');
    const kbRow = rows.find((row) => within(row).queryByText('Test Knowledge Base 1'));
    expect(kbRow).toBeDefined();

    if (!kbRow) {
      throw new Error('Knowledge base row not found');
    }

    const actionsButton = within(kbRow).getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const deleteButton = await screen.findByText('Delete');
    await user.click(deleteButton);

    expect(await screen.findByText(DELETE_CONFIRMATION_REGEX)).toBeVisible();

    const confirmationInput = screen.getByPlaceholderText(TYPE_DELETE_REGEX);
    await user.type(confirmationInput, 'delete');

    await waitFor(() => {
      const confirmButton = screen.getByRole('button', { name: DELETE_BUTTON_REGEX });
      expect(confirmButton).not.toBeDisabled();
    });

    const confirmButton = screen.getByRole('button', { name: DELETE_BUTTON_REGEX });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(deleteKnowledgeBaseMock).toHaveBeenCalledTimes(1);
      expect(deleteKnowledgeBaseMock).toHaveBeenCalledWith(
        create(DeleteKnowledgeBaseRequestSchema, {
          id: 'kb-1',
        }),
        expect.anything()
      );
    });
  });

  test('should display loading state when fetching knowledge bases', async () => {
    const listKnowledgeBasesMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              create(ListKnowledgeBasesResponseSchema, {
                knowledgeBases: [],
                nextPageToken: '',
              })
            );
          }, 100);
        })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, listKnowledgeBasesMock);
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    expect(screen.getByText('Loading knowledge bases...')).toBeVisible();

    await waitFor(() => {
      expect(screen.queryByText('Loading knowledge bases...')).not.toBeInTheDocument();
    });
  });

  test('should display empty state when no knowledge bases exist', async () => {
    const listKnowledgeBasesResponse = create(ListKnowledgeBasesResponseSchema, {
      knowledgeBases: [],
      nextPageToken: '',
    });

    const listKnowledgeBasesMock = vi.fn().mockReturnValue(listKnowledgeBasesResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, listKnowledgeBasesMock);
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    await waitFor(() => {
      expect(screen.getByText('No knowledge bases found.')).toBeVisible();
    });

    expect(screen.getByText('Create Knowledge Base')).toBeVisible();
  });

  test('should update pagination footer and disable next button on the last page', async () => {
    const user = userEvent.setup();

    const listKnowledgeBasesResponse = create(ListKnowledgeBasesResponseSchema, {
      knowledgeBases: PAGINATION_KBS_FIXTURE,
      nextPageToken: '',
    });

    const listKnowledgeBasesMock = vi.fn().mockReturnValue(listKnowledgeBasesResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, listKnowledgeBasesMock);
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    expect(await screen.findByText('Page 1 of 3')).toBeVisible();

    const previousButton = screen.getByRole('button', { name: 'Go to previous page' });
    const nextButton = screen.getByRole('button', { name: 'Go to next page' });

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    await user.click(nextButton);

    expect(await screen.findByText('Page 2 of 3')).toBeVisible();

    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(await screen.findByText('Page 3 of 3')).toBeVisible();

    expect(screen.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  });

  test('filters knowledge bases by search text and updates results', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'kb-1',
      displayName: 'Customer Support KB',
      description: 'Handles support queries',
      tags: {},
    });

    const kb2 = create(KnowledgeBaseSchema, {
      id: 'kb-2',
      displayName: 'Product Docs KB',
      description: 'Product documentation',
      tags: {},
    });

    const kb3 = create(KnowledgeBaseSchema, {
      id: 'kb-3',
      displayName: 'Internal Wiki KB',
      description: 'Internal notes',
      tags: {},
    });

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, () =>
        create(ListKnowledgeBasesResponseSchema, {
          knowledgeBases: [kb1, kb2, kb3],
          nextPageToken: '',
        })
      );
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Customer Support KB')).toBeVisible();
      expect(screen.getByText('Product Docs KB')).toBeVisible();
      expect(screen.getByText('Internal Wiki KB')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter knowledge bases...');

    // Type partial name that matches only one KB
    await user.type(filterInput, 'Product');

    await waitFor(() => {
      expect(screen.getByText('Product Docs KB')).toBeVisible();
      expect(screen.queryByText('Customer Support KB')).not.toBeInTheDocument();
      expect(screen.queryByText('Internal Wiki KB')).not.toBeInTheDocument();
    });

    // Update the search to match a different KB
    await user.clear(filterInput);
    await user.type(filterInput, 'Internal');

    await waitFor(() => {
      expect(screen.getByText('Internal Wiki KB')).toBeVisible();
      expect(screen.queryByText('Customer Support KB')).not.toBeInTheDocument();
      expect(screen.queryByText('Product Docs KB')).not.toBeInTheDocument();
    });
  });

  test('embedding model faceted filter filters results', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'kb-1',
      displayName: 'OpenAI KB',
      description: '',
      tags: {},
      embeddingGenerator: create(KnowledgeBase_EmbeddingGeneratorSchema, {
        model: 'text-embedding-3-small',
        provider: create(KnowledgeBase_EmbeddingGenerator_ProviderSchema, {
          provider: { case: 'openai', value: { apiKey: 'key' } },
        }),
      }),
    });

    const kb2 = create(KnowledgeBaseSchema, {
      id: 'kb-2',
      displayName: 'Cohere KB',
      description: '',
      tags: {},
      embeddingGenerator: create(KnowledgeBase_EmbeddingGeneratorSchema, {
        model: 'embed-english-v3.0',
        provider: create(KnowledgeBase_EmbeddingGenerator_ProviderSchema, {
          provider: { case: 'cohere', value: { apiKey: 'key' } },
        }),
      }),
    });

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, () =>
        create(ListKnowledgeBasesResponseSchema, {
          knowledgeBases: [kb1, kb2],
          nextPageToken: '',
        })
      );
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    await waitFor(() => {
      expect(screen.getByText('OpenAI KB')).toBeVisible();
      expect(screen.getByText('Cohere KB')).toBeVisible();
    });

    // Click the "Embedding Model" faceted filter button (not the column header one in <thead>)
    const embeddingFilterButton = screen
      .getAllByRole('button', { name: /embedding model/i })
      .find((btn) => !btn.closest('thead'))!;
    await user.click(embeddingFilterButton);

    // Select the "text-embedding-3-small" option from the filter popover
    const option = await screen.findByRole('option', { name: /text-embedding-3-small/i });
    await user.click(option);

    // Only the OpenAI KB should remain visible
    await waitFor(() => {
      expect(screen.getByText('OpenAI KB')).toBeVisible();
      expect(screen.queryByText('Cohere KB')).not.toBeInTheDocument();
    });
  });

  test('reranker model faceted filter filters results', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'kb-1',
      displayName: 'With Reranker KB',
      description: '',
      tags: {},
      retriever: create(KnowledgeBase_RetrieverSchema, {
        reranker: create(KnowledgeBase_Retriever_RerankerSchema, {
          enabled: true,
          provider: create(KnowledgeBase_Retriever_Reranker_ProviderSchema, {
            provider: {
              case: 'cohere',
              value: create(KnowledgeBase_Retriever_Reranker_Provider_CohereSchema, {
                model: 'rerank-v3.5',
                apiKey: 'key',
              }),
            },
          }),
        }),
      }),
    });

    const kb2 = create(KnowledgeBaseSchema, {
      id: 'kb-2',
      displayName: 'No Reranker KB',
      description: '',
      tags: {},
    });

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, () =>
        create(ListKnowledgeBasesResponseSchema, {
          knowledgeBases: [kb1, kb2],
          nextPageToken: '',
        })
      );
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    await waitFor(() => {
      expect(screen.getByText('With Reranker KB')).toBeVisible();
      expect(screen.getByText('No Reranker KB')).toBeVisible();
    });

    // Click the "Reranker Model" faceted filter button (not the column header one in <thead>)
    const rerankerFilterButton = screen
      .getAllByRole('button', { name: /reranker model/i })
      .find((btn) => !btn.closest('thead'))!;
    await user.click(rerankerFilterButton);

    // Select the "rerank-v3.5" option
    const option = await screen.findByRole('option', { name: /rerank-v3\.5/i });
    await user.click(option);

    // Only the KB with reranker should remain visible
    await waitFor(() => {
      expect(screen.getByText('With Reranker KB')).toBeVisible();
      expect(screen.queryByText('No Reranker KB')).not.toBeInTheDocument();
    });
  });
});

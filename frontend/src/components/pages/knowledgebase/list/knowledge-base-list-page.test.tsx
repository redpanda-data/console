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
  KnowledgeBase_EmbeddingGeneratorSchema,
  KnowledgeBase_EmbeddingGenerator_ProviderSchema,
  KnowledgeBase_RetrieverSchema,
  KnowledgeBase_Retriever_RerankerSchema,
  KnowledgeBase_Retriever_Reranker_ProviderSchema,
  KnowledgeBase_Retriever_Reranker_Provider_CohereSchema,
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

    const deleteButton = await screen.findByText('Delete', {}, { timeout: 3000 });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByText(DELETE_CONFIRMATION_REGEX)).toBeVisible();
    });

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

  test('should filter knowledge bases by search text', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'kb-1',
      displayName: 'Alpha Knowledge Base',
      description: 'First description',
      tags: {},
    });

    const kb2 = create(KnowledgeBaseSchema, {
      id: 'kb-2',
      displayName: 'Beta Knowledge Base',
      description: 'Second description',
      tags: {},
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
      expect(screen.getByText('Alpha Knowledge Base')).toBeVisible();
      expect(screen.getByText('Beta Knowledge Base')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter knowledge bases...');
    await user.type(filterInput, 'Alpha');

    await waitFor(() => {
      expect(screen.getByText('Alpha Knowledge Base')).toBeVisible();
      expect(screen.queryByText('Beta Knowledge Base')).not.toBeInTheDocument();
    });
  });

  test('should filter knowledge bases by name', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'production-kb',
      displayName: 'Production KB',
      description: 'Production environment',
      tags: {},
    });

    const kb2 = create(KnowledgeBaseSchema, {
      id: 'staging-kb',
      displayName: 'Staging KB',
      description: 'Staging environment',
      tags: {},
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
      expect(screen.getByText('Production KB')).toBeVisible();
      expect(screen.getByText('Staging KB')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter knowledge bases...');
    await user.type(filterInput, 'Production');

    await waitFor(() => {
      expect(screen.getByText('Production KB')).toBeVisible();
      expect(screen.queryByText('Staging KB')).not.toBeInTheDocument();
    });
  });

  test('should filter knowledge bases by display name', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'kb-1',
      displayName: 'First KB',
      description: 'Contains customer data',
      tags: {},
    });

    const kb2 = create(KnowledgeBaseSchema, {
      id: 'kb-2',
      displayName: 'Second KB',
      description: 'Contains product information',
      tags: {},
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
      expect(screen.getByText('First KB')).toBeVisible();
      expect(screen.getByText('Second KB')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter knowledge bases...');
    await user.type(filterInput, 'First');

    await waitFor(() => {
      expect(screen.getByText('First KB')).toBeVisible();
      expect(screen.queryByText('Second KB')).not.toBeInTheDocument();
    });
  });

  test('should update pagination footer and disable next button on the last page', async () => {
    const user = userEvent.setup();
    const knowledgeBases = Array.from({ length: 25 }, (_, index) =>
      create(KnowledgeBaseSchema, {
        id: `kb-${index + 1}`,
        displayName: `Knowledge Base ${index + 1}`,
        description: `Description ${index + 1}`,
        tags: {},
      })
    );

    const listKnowledgeBasesResponse = create(ListKnowledgeBasesResponseSchema, {
      knowledgeBases,
      nextPageToken: '',
    });

    const listKnowledgeBasesMock = vi.fn().mockReturnValue(listKnowledgeBasesResponse);

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, listKnowledgeBasesMock);
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

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

  test('search input value updates on each keystroke', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'kb-1',
      displayName: 'Alpha',
      description: '',
      tags: {},
    });

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listKnowledgeBases, () =>
        create(ListKnowledgeBasesResponseSchema, {
          knowledgeBases: [kb1],
          nextPageToken: '',
        })
      );
    });

    renderWithFileRoutes(<KnowledgeBaseList />, { transport });

    await waitFor(() => {
      expect(screen.getByText('Alpha')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter knowledge bases...');

    await user.type(filterInput, 'test');

    // The input value must reflect what was typed — a React Compiler
    // memoization bug would freeze it at the initial empty string.
    expect(filterInput).toHaveValue('test');
  });

  test('search input can be cleared and reused', async () => {
    const user = userEvent.setup();

    const kb1 = create(KnowledgeBaseSchema, {
      id: 'kb-1',
      displayName: 'Alpha KB',
      description: '',
      tags: {},
    });

    const kb2 = create(KnowledgeBaseSchema, {
      id: 'kb-2',
      displayName: 'Beta KB',
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
      expect(screen.getByText('Alpha KB')).toBeVisible();
      expect(screen.getByText('Beta KB')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter knowledge bases...');

    // Type to filter down to Alpha only
    await user.type(filterInput, 'Alpha');

    await waitFor(() => {
      expect(screen.getByText('Alpha KB')).toBeVisible();
      expect(screen.queryByText('Beta KB')).not.toBeInTheDocument();
    });

    // Clear the input completely
    await user.clear(filterInput);
    expect(filterInput).toHaveValue('');

    // Both rows should reappear
    await waitFor(() => {
      expect(screen.getByText('Alpha KB')).toBeVisible();
      expect(screen.getByText('Beta KB')).toBeVisible();
    });

    // Type again to filter down to Beta
    await user.type(filterInput, 'Beta');

    await waitFor(() => {
      expect(screen.queryByText('Alpha KB')).not.toBeInTheDocument();
      expect(screen.getByText('Beta KB')).toBeVisible();
    });

    expect(filterInput).toHaveValue('Beta');
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

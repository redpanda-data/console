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

import { create } from '@bufbuild/protobuf';
import type { KnowledgeBase } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import {
  KnowledgeBase_EmbeddingGenerator_ProviderSchema,
  KnowledgeBase_EmbeddingGeneratorSchema,
  KnowledgeBase_Retriever_Reranker_Provider_CohereSchema,
  KnowledgeBase_Retriever_Reranker_ProviderSchema,
  KnowledgeBase_Retriever_RerankerSchema,
  KnowledgeBase_RetrieverSchema,
  KnowledgeBaseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { describe, expect, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-react';

import {
  getRouteComponent,
  mockConnectQuery,
  mockRouterForBrowserTest,
  ScreenshotFrame,
} from '../../../../__tests__/browser-test-utils';

// Hoisted mocks — `vi.mock` factories run before module imports, so any state
// they reference must be declared via `vi.hoisted()` to survive hoisting.
const mocks = vi.hoisted(() => ({
  listKnowledgeBases: vi.fn<() => { data: unknown; isLoading: boolean; error: Error | null }>().mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  }),
  listTopics: vi.fn<() => { data: unknown; isLoading: boolean; error: Error | null }>().mockReturnValue({
    data: { topics: [] },
    isLoading: false,
    error: null,
  }),
}));

vi.mock('@tanstack/react-router', () => mockRouterForBrowserTest());
vi.mock('@connectrpc/connect-query', () => mockConnectQuery());

vi.mock('config', () => ({
  config: { jwt: 'test-jwt-token', controlplaneUrl: 'http://localhost:9090' },
  isFeatureFlagEnabled: vi.fn(() => false),
  isEmbedded: vi.fn(() => false),
  addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
}));

vi.mock('state/ui-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('state/ui-state')>();
  return {
    ...actual,
    uiState: { pageTitle: '', pageBreadcrumbs: [] },
  };
});

// KnowledgeBaseListPage gates both queries behind `pipelinesApi`. Pin it true
// so the table, filters, and pagination render against fixtures.
vi.mock('state/supported-features', () => ({
  useSupportedFeaturesStore: (selector: (s: { pipelinesApi: boolean }) => unknown) => selector({ pipelinesApi: true }),
}));

vi.mock('react-query/api/knowledge-base', () => ({
  useListKnowledgeBasesQuery: () => mocks.listKnowledgeBases(),
  useDeleteKnowledgeBaseMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('react-query/api/topic', () => ({
  useListTopicsQuery: () => mocks.listTopics(),
}));

const { KnowledgeBaseListPage } = await import('./knowledge-base-list-page');

// Route-component extraction guard — exercises getRouteComponent for parity
// with the ADP UI browser-test pattern.
getRouteComponent({ component: KnowledgeBaseListPage });

const testKnowledgeBases: KnowledgeBase[] = [
  create(KnowledgeBaseSchema, {
    id: 'kb-prod-support',
    displayName: 'Customer Support KB',
    description: 'RAG index for the support team built from Zendesk tickets and the help center.',
    indexer: { inputTopics: ['support-tickets', 'help-articles'] },
    embeddingGenerator: create(KnowledgeBase_EmbeddingGeneratorSchema, {
      model: 'text-embedding-3-small',
      provider: create(KnowledgeBase_EmbeddingGenerator_ProviderSchema, {
        provider: { case: 'openai', value: { apiKey: 'secret-support' } },
      }),
    }),
    retriever: create(KnowledgeBase_RetrieverSchema, {
      reranker: create(KnowledgeBase_Retriever_RerankerSchema, {
        enabled: true,
        provider: create(KnowledgeBase_Retriever_Reranker_ProviderSchema, {
          provider: {
            case: 'cohere',
            value: create(KnowledgeBase_Retriever_Reranker_Provider_CohereSchema, {
              model: 'rerank-v3.5',
              apiKey: 'secret-support-reranker',
            }),
          },
        }),
      }),
    }),
    tags: { env: 'production', team: 'support' },
    retrievalApiUrl: 'https://api.example.com/kb/prod-support',
  }),
  create(KnowledgeBaseSchema, {
    id: 'kb-product-docs',
    displayName: 'Product Docs KB',
    description: 'Ingests product docs from the docs topic for chatbot grounding.',
    indexer: { inputTopics: ['product-docs'] },
    embeddingGenerator: create(KnowledgeBase_EmbeddingGeneratorSchema, {
      model: 'embed-english-v3.0',
      provider: create(KnowledgeBase_EmbeddingGenerator_ProviderSchema, {
        provider: { case: 'cohere', value: { apiKey: 'secret-product-docs' } },
      }),
    }),
    tags: { env: 'staging' },
    retrievalApiUrl: 'https://api.example.com/kb/product-docs',
  }),
  create(KnowledgeBaseSchema, {
    id: 'kb-internal-wiki',
    displayName: 'Internal Wiki KB',
    description: 'Internal runbooks and notes — no reranker configured.',
    indexer: { inputTopics: [] },
    tags: {},
    retrievalApiUrl: 'https://api.example.com/kb/internal-wiki',
  }),
];

describe('KnowledgeBaseListPage — browser visual regression', () => {
  test('populated table with filters, topic chips, and pagination footer', async () => {
    mocks.listKnowledgeBases.mockReturnValue({
      data: { knowledgeBases: testKnowledgeBases },
      isLoading: false,
      error: null,
    });
    mocks.listTopics.mockReturnValue({
      data: {
        topics: [
          { name: 'support-tickets', internal: false },
          { name: 'help-articles', internal: false },
          { name: 'product-docs', internal: false },
        ],
      },
      isLoading: false,
      error: null,
    });

    render(
      <ScreenshotFrame width={1280}>
        <KnowledgeBaseListPage />
      </ScreenshotFrame>
    );

    await expect.element(page.getByText('Customer Support KB')).toBeVisible();
    await expect.element(page.getByText('Product Docs KB')).toBeVisible();
    await expect.element(page.getByText('Internal Wiki KB')).toBeVisible();
    await expect.element(page.getByRole('heading', { name: 'Knowledge Bases' })).toBeVisible();
    // Toolbar + pagination confirm the full table chrome is rendered.
    await expect.element(page.getByPlaceholder('Filter knowledge bases...')).toBeVisible();
    await expect.element(page.getByText('Page 1 of 1')).toBeVisible();

    await expect(page.getByTestId('screenshot-frame')).toMatchScreenshot('knowledge-base-list-populated');
  });
});

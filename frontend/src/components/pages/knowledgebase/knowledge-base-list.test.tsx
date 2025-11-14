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
  KnowledgeBaseSchema,
  ListKnowledgeBasesResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import { listKnowledgeBases } from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base-KnowledgeBaseService_connectquery';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from 'test-utils';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
}));

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

vi.mock('state/supported-features', () => ({
  Features: {
    pipelinesApi: true,
  },
}));

import { KnowledgeBaseList } from './knowledge-base-list';

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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base 1')).toBeVisible();
      expect(screen.getByText('Test Knowledge Base 2')).toBeVisible();
    });

    expect(listKnowledgeBasesMock).toHaveBeenCalledTimes(1);

    expect(screen.getByText('kb-1')).toBeVisible();
    expect(screen.getByText('kb-2')).toBeVisible();

    expect(screen.getByText('Description for KB 1')).toBeVisible();
    expect(screen.getByText('Description for KB 2')).toBeVisible();

    expect(screen.getByText('env: production')).toBeVisible();
    expect(screen.getByText('team: data-science')).toBeVisible();
    expect(screen.getByText('env: staging')).toBeVisible();
  });

  test('should navigate to knowledge base details when clicking on ID link', async () => {
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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('test-kb-123')).toBeVisible();
    });

    const idLink = screen.getByText('test-kb-123').closest('a');
    expect(idLink).toHaveAttribute('href', '/knowledgebases/test-kb-123');
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

    const { container } = render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

    const skeleton = container.querySelector('.chakra-skeleton');
    expect(skeleton).toBeInTheDocument();

    await waitFor(() => {
      const skeletonAfter = container.querySelector('.chakra-skeleton');
      expect(skeletonAfter).not.toBeInTheDocument();
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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('You have no knowledge bases.')).toBeVisible();
    });

    expect(screen.getAllByTestId('create-knowledge-base-button').length).toBeGreaterThan(0);
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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

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

  test('should filter knowledge bases by ID', async () => {
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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('production-kb')).toBeVisible();
      expect(screen.getByText('staging-kb')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter knowledge bases...');
    await user.type(filterInput, 'production');

    await waitFor(() => {
      expect(screen.getByText('production-kb')).toBeVisible();
      expect(screen.queryByText('staging-kb')).not.toBeInTheDocument();
    });
  });

  test('should filter knowledge bases by description', async () => {
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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('First KB')).toBeVisible();
      expect(screen.getByText('Second KB')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter knowledge bases...');
    await user.type(filterInput, 'customer');

    await waitFor(() => {
      expect(screen.getByText('First KB')).toBeVisible();
      expect(screen.queryByText('Second KB')).not.toBeInTheDocument();
    });
  });
});

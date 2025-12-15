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
  DeleteKnowledgeBaseResponseSchema,
  KnowledgeBaseSchema,
  ListKnowledgeBasesResponseSchema,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base_pb';
import {
  deleteKnowledgeBase,
  listKnowledgeBases,
} from 'protogen/redpanda/api/dataplane/v1alpha3/knowledge_base-KnowledgeBaseService_connectquery';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from 'test-utils';

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

import { KnowledgeBaseListPage as KnowledgeBaseList } from './knowledge-base-list-page';

const OPEN_MENU_REGEX = /open menu/i;
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

    expect(screen.getByText('Description for KB 1')).toBeVisible();
    expect(screen.getByText('Description for KB 2')).toBeVisible();
  });

  test('should trigger delete RPC when submitting deletion', async () => {
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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base 1')).toBeVisible();
    });

    const rows = screen.getAllByRole('row');
    const kbRow = rows.find((row) => within(row).queryByText('Test Knowledge Base 1'));

    if (!kbRow) {
      throw new Error('Knowledge base row not found');
    }

    const actionsButton = within(kbRow).getByRole('button', { name: OPEN_MENU_REGEX });
    await user.click(actionsButton);

    const deleteButton = await screen.findByText('Delete', {});
    await user.click(deleteButton);

    const confirmationInput = await screen.findByPlaceholderText(TYPE_DELETE_REGEX);
    await user.type(confirmationInput, 'delete');

    const confirmButton = screen.getByRole('button', { name: DELETE_BUTTON_REGEX });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(deleteKnowledgeBaseMock).toHaveBeenCalledWith({
        id: 'kb-1',
      });
      expect(deleteKnowledgeBaseMock).toHaveBeenCalledTimes(1);
    });
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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('Test Knowledge Base')).toBeVisible();
    });

    const row = screen.getByText('Test Knowledge Base').closest('tr');
    if (row) {
      await user.click(row);
    }
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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

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

    render(
      <MemoryRouter>
        <KnowledgeBaseList />
      </MemoryRouter>,
      { transport }
    );

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
    await user.type(filterInput, 'First');

    await waitFor(() => {
      expect(screen.getByText('First KB')).toBeVisible();
      expect(screen.queryByText('Second KB')).not.toBeInTheDocument();
    });
  });
});

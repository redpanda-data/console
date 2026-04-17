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
import { ListSecretsResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { Scope, SecretSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import React from 'react';
import { MAX_PAGE_SIZE } from 'react-query/react-query.utils';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

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

Element.prototype.scrollIntoView = vi.fn();

import { SecretsStoreListPage } from './secrets-store-list-page';

const createListSecretsTransport = (listSecretsMock: ReturnType<typeof vi.fn>) =>
  createRouterTransport(({ rpc }) => {
    rpc(listSecrets, listSecretsMock);
  });

// Hoisted once — 25 rows = 3 pages at the page's hard-coded pageSize of 10.
const PAGINATION_SECRETS_FIXTURE = Array.from({ length: 25 }, (_, index) =>
  create(SecretSchema, {
    id: `test-secret-${index + 1}`,
    labels: { env: 'production' },
    scopes: [Scope.AI_GATEWAY],
  })
);

describe('SecretsStoreListPage', () => {
  test('should call listSecrets on render and display secret IDs', async () => {
    const secret1 = create(SecretSchema, {
      id: 'test-secret-123',
      labels: { env: 'production' },
      scopes: [Scope.AI_GATEWAY, Scope.MCP_SERVER],
    });

    const listSecretsResponse = create(ListSecretsResponseSchema, {
      response: {
        secrets: [secret1],
        nextPageToken: '',
      },
    });

    const listSecretsMock = vi.fn().mockReturnValue(listSecretsResponse);
    const transport = createListSecretsTransport(listSecretsMock);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    expect(await screen.findByText('test-secret-123')).toBeVisible();

    expect(listSecretsMock).toHaveBeenCalledTimes(1);
    const callArgs = listSecretsMock.mock.calls[0];
    expect(callArgs[0]).toMatchObject({
      request: {
        pageSize: MAX_PAGE_SIZE,
      },
    });
  });

  test('should display empty state when no secrets exist', async () => {
    const listSecretsResponse = create(ListSecretsResponseSchema, {
      response: {
        secrets: [],
        nextPageToken: '',
      },
    });

    const listSecretsMock = vi.fn().mockReturnValue(listSecretsResponse);
    const transport = createListSecretsTransport(listSecretsMock);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    expect(await screen.findByText('No secrets found.')).toBeVisible();
  });

  test('should display loading state while fetching secrets', async () => {
    const listSecretsMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              create(ListSecretsResponseSchema, {
                response: {
                  secrets: [],
                  nextPageToken: '',
                },
              })
            );
          }, 100);
        })
    );

    const transport = createListSecretsTransport(listSecretsMock);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    expect(screen.getByText('Loading secrets...')).toBeVisible();

    await waitFor(() => {
      expect(screen.queryByText('Loading secrets...')).not.toBeInTheDocument();
    });
  });

  test('should update pagination footer and disable next button on the last page', async () => {
    const user = userEvent.setup();

    const listSecretsResponse = create(ListSecretsResponseSchema, {
      response: {
        secrets: PAGINATION_SECRETS_FIXTURE,
        nextPageToken: '',
      },
    });

    const listSecretsMock = vi.fn().mockReturnValue(listSecretsResponse);
    const transport = createListSecretsTransport(listSecretsMock);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

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

  test('search input updates value on keystrokes', async () => {
    const user = userEvent.setup();

    const secret1 = create(SecretSchema, {
      id: 'my-secret',
      labels: {},
      scopes: [Scope.AI_GATEWAY],
    });

    const listSecretsMock = vi.fn().mockReturnValue(
      create(ListSecretsResponseSchema, {
        response: { secrets: [secret1], nextPageToken: '' },
      })
    );
    const transport = createListSecretsTransport(listSecretsMock);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    expect(await screen.findByText('my-secret')).toBeVisible();

    const filterInput = screen.getByPlaceholderText('Filter by ID...');
    await user.type(filterInput, 'hello');

    // Input value must reflect typed text — a React Compiler memoization
    // bug would freeze it at the initial empty string.
    expect(filterInput).toHaveValue('hello');
  });

  test('filters secrets by ID via search input', async () => {
    const user = userEvent.setup();

    const secret1 = create(SecretSchema, {
      id: 'alpha-secret',
      labels: {},
      scopes: [Scope.AI_GATEWAY],
    });

    const secret2 = create(SecretSchema, {
      id: 'beta-secret',
      labels: {},
      scopes: [Scope.MCP_SERVER],
    });

    const listSecretsMock = vi.fn().mockReturnValue(
      create(ListSecretsResponseSchema, {
        response: { secrets: [secret1, secret2], nextPageToken: '' },
      })
    );
    const transport = createListSecretsTransport(listSecretsMock);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('alpha-secret')).toBeVisible();
      expect(screen.getByText('beta-secret')).toBeVisible();
    });

    const filterInput = screen.getByPlaceholderText('Filter by ID...');
    await user.type(filterInput, 'beta');

    await waitFor(() => {
      expect(screen.getByText('beta-secret')).toBeVisible();
      expect(screen.queryByText('alpha-secret')).not.toBeInTheDocument();
    });

    // Clear and verify all rows reappear
    await user.clear(filterInput);

    await waitFor(() => {
      expect(screen.getByText('alpha-secret')).toBeVisible();
      expect(screen.getByText('beta-secret')).toBeVisible();
    });
  });

  test('scope faceted filter filters results', async () => {
    const user = userEvent.setup();

    const secret1 = create(SecretSchema, {
      id: 'gateway-secret',
      labels: {},
      scopes: [Scope.AI_GATEWAY],
    });

    const secret2 = create(SecretSchema, {
      id: 'mcp-secret',
      labels: {},
      scopes: [Scope.MCP_SERVER],
    });

    const listSecretsMock = vi.fn().mockReturnValue(
      create(ListSecretsResponseSchema, {
        response: { secrets: [secret1, secret2], nextPageToken: '' },
      })
    );
    const transport = createListSecretsTransport(listSecretsMock);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText('gateway-secret')).toBeVisible();
      expect(screen.getByText('mcp-secret')).toBeVisible();
    });

    // Click the "Scope" faceted filter button (not the column header one in <thead>)
    const scopeFilterButton = screen.getAllByRole('button', { name: /scope/i }).find((btn) => !btn.closest('thead'))!;
    await user.click(scopeFilterButton);

    // Select the "MCP Server" option from the filter popover
    const mcpOption = await screen.findByRole('option', { name: /mcp server/i });
    await user.click(mcpOption);

    // Only the MCP-scoped secret should remain visible
    await waitFor(() => {
      expect(screen.getByText('mcp-secret')).toBeVisible();
      expect(screen.queryByText('gateway-secret')).not.toBeInTheDocument();
    });
  });
});

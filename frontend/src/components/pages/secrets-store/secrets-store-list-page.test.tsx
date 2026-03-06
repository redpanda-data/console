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

vi.mock('components/redpanda-ui/components/data-table', async (importOriginal) => {
  const actual = await importOriginal<typeof import('components/redpanda-ui/components/data-table')>();

  return {
    ...actual,
    DataTablePagination: React.memo(actual.DataTablePagination as React.ComponentType<any>),
  };
});

import { SecretsStoreListPage } from './secrets-store-list-page';

const createListSecretsTransport = (listSecretsMock: ReturnType<typeof vi.fn>) =>
  createRouterTransport(({ rpc }) => {
    rpc(listSecrets, listSecretsMock);
  });

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

    await waitFor(() => {
      expect(screen.getByText('test-secret-123')).toBeVisible();
    });

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

    await waitFor(() => {
      expect(screen.getByText('No secrets found.')).toBeVisible();
    });
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
    const secrets = Array.from({ length: 25 }, (_, index) =>
      create(SecretSchema, {
        id: `test-secret-${index + 1}`,
        labels: { env: 'production' },
        scopes: [Scope.AI_GATEWAY],
      })
    );

    const listSecretsResponse = create(ListSecretsResponseSchema, {
      response: {
        secrets,
        nextPageToken: '',
      },
    });

    const listSecretsMock = vi.fn().mockReturnValue(listSecretsResponse);
    const transport = createListSecretsTransport(listSecretsMock);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

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

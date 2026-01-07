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
import { ListSecretsResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { Scope, SecretSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from 'test-utils';

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

import { SecretsStoreListPage } from './secrets-store-list-page';

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

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
    });

    render(
      <MemoryRouter>
        <SecretsStoreListPage />
      </MemoryRouter>,
      { transport }
    );

    await waitFor(() => {
      expect(screen.getByText('test-secret-123')).toBeVisible();
    });

    expect(listSecretsMock).toHaveBeenCalledTimes(1);
    const callArgs = listSecretsMock.mock.calls[0];
    expect(callArgs[0]).toMatchObject({
      request: {
        pageSize: 500,
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

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
    });

    render(
      <MemoryRouter>
        <SecretsStoreListPage />
      </MemoryRouter>,
      { transport }
    );

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

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
    });

    render(
      <MemoryRouter>
        <SecretsStoreListPage />
      </MemoryRouter>,
      { transport }
    );

    expect(screen.getByText('Loading secrets...')).toBeVisible();

    await waitFor(() => {
      expect(screen.queryByText('Loading secrets...')).not.toBeInTheDocument();
    });
  });
});

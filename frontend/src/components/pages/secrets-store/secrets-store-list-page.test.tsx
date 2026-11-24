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
import { createRouterTransport, type MethodImpl } from '@connectrpc/connect';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import {
  type ListSecretsRequest,
  type ListSecretsResponse,
  ListSecretsResponseSchema,
} from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { Scope, type Secret, SecretSchema } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { SECRETS_LIST_PAGE_SIZE } from 'react-query/api/secret';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { SecretsStoreListPage } from './secrets-store-list-page';

const createListSecretsTransport = (handler: MethodImpl<typeof listSecrets>) =>
  createRouterTransport(({ rpc }) => {
    rpc(listSecrets, handler);
  });

const PAGINATION_SECRETS_FIXTURE = Array.from({ length: 25 }, (_, index) =>
  create(SecretSchema, {
    id: `test-secret-${index + 1}`,
    labels: { env: 'production' },
    scopes: [Scope.AI_GATEWAY],
  })
);

const renderListPage = (secrets: Secret[]) => {
  const response = create(ListSecretsResponseSchema, {
    response: { secrets, nextPageToken: '' },
  });
  const transport = createListSecretsTransport(() => response);

  renderWithFileRoutes(<SecretsStoreListPage />, { transport });
};

const getPaginationButtons = () => ({
  previousButton: screen.getByRole('button', { name: 'Go to previous page' }),
  nextButton: screen.getByRole('button', { name: 'Go to next page' }),
});

async function goToNextPage(user: UserEvent, expectedFooter: string) {
  await user.click(screen.getByRole('button', { name: 'Go to next page' }));

  expect(await screen.findByText(expectedFooter)).toBeVisible();
}

describe('the SecretsStoreListPage', () => {
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

    const requests: ListSecretsRequest[] = [];
    const transport = createListSecretsTransport((request) => {
      requests.push(request);
      return listSecretsResponse;
    });

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    expect(await screen.findByText('test-secret-123')).toBeVisible();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      request: {
        pageSize: SECRETS_LIST_PAGE_SIZE,
        pageToken: '',
      },
    });
  });

  test('follows nextPageToken until all secrets are returned', async () => {
    const pageOne = [
      create(SecretSchema, {
        id: 'page1-first-secret',
        labels: {},
        scopes: [Scope.AI_GATEWAY],
      }),
    ];
    const pageTwo = [
      create(SecretSchema, {
        id: 'page2-pgdb-dsn',
        labels: {},
        scopes: [Scope.AI_GATEWAY],
      }),
    ];

    const requests: ListSecretsRequest[] = [];
    const transport = createListSecretsTransport((message) => {
      requests.push(message);
      if (!message.request?.pageToken) {
        return create(ListSecretsResponseSchema, {
          response: { secrets: pageOne, nextPageToken: 'page2' },
        });
      }
      return create(ListSecretsResponseSchema, {
        response: { secrets: pageTwo, nextPageToken: '' },
      });
    });
    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    expect(await screen.findByText('page1-first-secret')).toBeVisible();
    expect(await screen.findByText('page2-pgdb-dsn')).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      request: { pageSize: SECRETS_LIST_PAGE_SIZE, pageToken: 'page2' },
    });
  });

  test('stops and surfaces an error if the server returns a non-advancing pageToken', async () => {
    const requests: ListSecretsRequest[] = [];
    const transport = createListSecretsTransport((request) => {
      requests.push(request);
      return create(ListSecretsResponseSchema, {
        response: {
          secrets: [create(SecretSchema, { id: 'looping-secret', scopes: [Scope.AI_GATEWAY] })],
          nextPageToken: 'stuck',
        },
      });
    });

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    await waitFor(() => {
      expect(screen.getByText(/Error loading secrets:/iu)).toBeVisible();
    });
    expect(requests).toHaveLength(2);
  });

  test('should display empty state when no secrets exist', async () => {
    const listSecretsResponse = create(ListSecretsResponseSchema, {
      response: {
        secrets: [],
        nextPageToken: '',
      },
    });

    const transport = createListSecretsTransport(() => listSecretsResponse);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    expect(await screen.findByText('No secrets found.')).toBeVisible();
  });

  test('should display loading state while fetching secrets', async () => {
    const pendingList = Promise.withResolvers<ListSecretsResponse>();
    const transport = createListSecretsTransport(() => pendingList.promise);

    renderWithFileRoutes(<SecretsStoreListPage />, { transport });

    expect(screen.getByText('Loading secrets...')).toBeVisible();

    pendingList.resolve(create(ListSecretsResponseSchema, { response: { secrets: [], nextPageToken: '' } }));

    await waitFor(() => {
      expect(screen.queryByText('Loading secrets...')).not.toBeInTheDocument();
    });
  });

  test('should update pagination footer and disable next button on the last page', async () => {
    const user = userEvent.setup();

    renderListPage(PAGINATION_SECRETS_FIXTURE);

    expect(await screen.findByText('Page 1 of 3')).toBeVisible();

    const { previousButton, nextButton } = getPaginationButtons();

    expect(previousButton).toBeDisabled();
    expect(nextButton).toBeEnabled();

    await goToNextPage(user, 'Page 2 of 3');

    expect(getPaginationButtons().previousButton).toBeEnabled();

    await goToNextPage(user, 'Page 3 of 3');

    expect(getPaginationButtons().nextButton).toBeDisabled();
  });

  test('filters secrets by ID via search input', async () => {
    const user = userEvent.setup();

    renderListPage([
      create(SecretSchema, {
        id: 'alpha-secret',
        labels: {},
        scopes: [Scope.AI_GATEWAY],
      }),
      create(SecretSchema, {
        id: 'beta-secret',
        labels: {},
        scopes: [Scope.MCP_SERVER],
      }),
    ]);

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

    await user.clear(filterInput);

    await waitFor(() => {
      expect(screen.getByText('alpha-secret')).toBeVisible();
      expect(screen.getByText('beta-secret')).toBeVisible();
    });
  });

  test('scope faceted filter filters results', async () => {
    const user = userEvent.setup();

    renderListPage([
      create(SecretSchema, {
        id: 'gateway-secret',
        labels: {},
        scopes: [Scope.AI_GATEWAY],
      }),
      create(SecretSchema, {
        id: 'mcp-secret',
        labels: {},
        scopes: [Scope.MCP_SERVER],
      }),
    ]);

    await waitFor(() => {
      expect(screen.getByText('gateway-secret')).toBeVisible();
      expect(screen.getByText('mcp-secret')).toBeVisible();
    });

    const scopeFilterButton = screen.getAllByRole('button', { name: /scope/iu }).find((btn) => !btn.closest('thead'))!;
    await user.click(scopeFilterButton);

    const mcpOption = await screen.findByRole('option', { name: /mcp server/iu });
    await user.click(mcpOption);

    await waitFor(() => {
      expect(screen.getByText('mcp-secret')).toBeVisible();
      expect(screen.queryByText('gateway-secret')).not.toBeInTheDocument();
    });
  });
});

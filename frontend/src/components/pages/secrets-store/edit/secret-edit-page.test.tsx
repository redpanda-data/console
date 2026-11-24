import { createRouterTransport } from '@connectrpc/connect';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { GetSecretRequest, UpdateSecretRequest } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import {
  getSecret,
  listSecrets,
  updateSecret,
} from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { render, screen, waitFor } from 'test-utils';

import { SecretEditPage } from './secret-edit-page';
import { trackedRouters } from '../../../../../tests/harness-cleanup';
import { SecretsStoreListPage } from '../secrets-store-list-page';

const SECRET_ID = 'TEST_SECRET';

const MCP_SCOPE = /MCP Server$/u;

async function renderEditPage() {
  const reads: GetSecretRequest[] = [];
  const updates: UpdateSecretRequest[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(getSecret, (request) => {
      reads.push(request);
      return { response: { secret: { id: SECRET_ID, scopes: [Scope.AI_GATEWAY], labels: { env: 'production' } } } };
    });
    rpc(updateSecret, (request) => {
      updates.push(request);
      return {};
    });
    rpc(listSecrets, () => ({ response: { secrets: [] } }));
  });
  const root = createRootRoute({ component: Outlet });
  const routes = [
    createRoute({ getParentRoute: () => root, path: '/secrets/$id/edit', component: SecretEditPage }),
    createRoute({ getParentRoute: () => root, path: '/secrets', component: SecretsStoreListPage }),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [`/secrets/${SECRET_ID}/edit`] }),
  });
  trackedRouters.add(router);
  await router.load();
  render(<RouterProvider router={router} />, { transport });
  return { router, reads, updates };
}

async function selectAdditionalScopes(user: UserEvent) {
  await user.click(screen.getByTestId('secret-scopes-select'));
  await user.click(await screen.findByRole('option', { name: MCP_SCOPE }));
  await user.click(screen.getByRole('option', { name: 'Redpanda Connect' }));
  await user.keyboard('{Escape}');
}

test('loads the route secret and updates its scopes without replacing the value', async () => {
  const user = userEvent.setup();
  const { router, reads, updates } = await renderEditPage();
  expect(await screen.findByDisplayValue(SECRET_ID)).toBeDisabled();
  expect(new Set(reads.map((read) => read.request?.id))).toEqual(new Set([SECRET_ID]));
  await selectAdditionalScopes(user);
  await user.click(screen.getByRole('button', { name: 'Update Secret' }));

  await waitFor(() => expect(router.state.location.pathname).toBe('/secrets'));
  expect(updates).toHaveLength(1);
  expect(updates[0].request).toMatchObject({
    id: SECRET_ID,
    secretData: new Uint8Array(0),
    scopes: [Scope.AI_GATEWAY, Scope.MCP_SERVER, Scope.REDPANDA_CONNECT],
    labels: { env: 'production' },
  });
});

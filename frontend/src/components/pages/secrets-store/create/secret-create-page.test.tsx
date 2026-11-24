import { createRouterTransport } from '@connectrpc/connect';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { CreateSecretRequest } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { createSecret, listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { SecretCreatePage } from './secret-create-page';

function renderCreatePage() {
  const requests: CreateSecretRequest[] = [];
  const transport = createRouterTransport(({ rpc }) => {
    rpc(listSecrets, () => ({ response: { secrets: [] } }));
    rpc(createSecret, (request) => {
      requests.push(request);
      return {};
    });
  });
  return { requests, ...renderWithFileRoutes(<SecretCreatePage />, { initialLocation: '/secrets/create', transport }) };
}

async function fillSecretForm(user: UserEvent) {
  await user.type(screen.getByPlaceholderText('SECRET_ID'), 'MY_TEST_SECRET');
  await user.type(screen.getByPlaceholderText('Enter secret value'), 'example-π');
  await user.click(screen.getByTestId('secret-scopes-select'));
  await user.click(await screen.findByRole('option', { name: 'AI Agent' }));
  await user.click(screen.getByRole('option', { name: 'Redpanda Connect' }));
  await user.click(screen.getByRole('option', { name: 'Redpanda Cluster' }));
  await user.keyboard('{Escape}');
}

test('sends the secret bytes and selected scopes, then returns to the store', async () => {
  const user = userEvent.setup();
  const { router, requests } = renderCreatePage();
  await fillSecretForm(user);
  await user.click(screen.getByRole('button', { name: 'Create Secret' }));

  await waitFor(() => expect(router.state.location.pathname).toBe('/secrets'));
  expect(requests).toHaveLength(1);
  expect(requests[0].request).toMatchObject({
    id: 'MY_TEST_SECRET',
    secretData: new TextEncoder().encode('example-π'),
    scopes: [Scope.AI_GATEWAY, Scope.MCP_SERVER],
  });
});

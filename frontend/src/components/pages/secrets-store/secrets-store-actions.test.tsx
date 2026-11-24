import type { MessageInitShape } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { DeleteSecretRequest } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { deleteSecret, listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  type ListResourcesRequest,
  ListResourcesResponse_Type,
  type ListResourcesResponseSchema,
  Scope,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { listResources } from 'protogen/redpanda/api/dataplane/v1/secret-SecretService_connectquery';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { SecretsStoreListPage } from './secrets-store-list-page';

const SECRET_ID = 'test-secret-id';
const CONFIRMATION_PLACEHOLDER = /type "delete" to confirm/iu;

function renderActions(resources: MessageInitShape<typeof ListResourcesResponseSchema>['resources'] = []) {
  const lookups: ListResourcesRequest[] = [];
  const deletes: DeleteSecretRequest[] = [];
  let exists = true;
  const transport = createRouterTransport(({ rpc }) => {
    rpc(listSecrets, () => ({ response: { secrets: exists ? [{ id: SECRET_ID, scopes: [Scope.MCP_SERVER] }] : [] } }));
    rpc(listResources, (request) => {
      lookups.push(request);
      return { resources };
    });
    rpc(deleteSecret, (request) => {
      deletes.push(request);
      if (request.request?.id === SECRET_ID) {
        exists = false;
      }
      return {};
    });
  });
  renderWithFileRoutes(<SecretsStoreListPage />, { transport });
  return { lookups, deletes };
}

async function openMenu(user: UserEvent) {
  await user.click(await screen.findByTestId('secret-actions-menu-trigger'));
}

async function openDeleteDialog(user: UserEvent) {
  await openMenu(user);
  await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
}

test('sends a confirmed delete to the server and refreshes the secret list', async () => {
  const user = userEvent.setup();
  const { deletes } = renderActions();

  await openDeleteDialog(user);
  const confirm = screen.getByRole('button', { name: 'Delete' });
  expect(confirm).toBeDisabled();
  expect(deletes).toHaveLength(0);
  await user.type(screen.getByPlaceholderText(CONFIRMATION_PLACEHOLDER), 'delete');
  await user.click(confirm);

  expect(await screen.findByText('No secrets found.')).toBeVisible();
  expect(deletes.map((request) => request.request?.id)).toEqual([SECRET_ID]);
});

test('copies the secret ID and keeps the menu open', async () => {
  const user = userEvent.setup();
  renderActions();

  await openMenu(user);
  await user.click(await screen.findByRole('menuitem', { name: 'Copy ID' }));

  await waitFor(async () => expect(await navigator.clipboard.readText()).toBe(SECRET_ID));
  expect(screen.getByRole('menuitem', { name: 'Copy ID' })).toBeVisible();
});

test('looks up resources for the selected secret before confirmation', async () => {
  const user = userEvent.setup();
  const { lookups, deletes } = renderActions([
    {
      id: 'pipeline-1',
      displayName: 'My Pipeline',
      type: ListResourcesResponse_Type.PIPELINE,
    },
  ]);

  await openDeleteDialog(user);

  expect(await screen.findByText('Resource is in use')).toBeVisible();
  expect(screen.getByText('Redpanda Connect Pipelines')).toBeVisible();
  expect(screen.getByText('My Pipeline')).toBeVisible();
  expect(lookups.map((request) => request.filter?.secretId)).toEqual([SECRET_ID]);
  expect(deletes).toHaveLength(0);
});

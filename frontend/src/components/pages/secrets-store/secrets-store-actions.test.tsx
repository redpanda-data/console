import { create, type MessageInitShape } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { deleteSecret } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  DeleteSecretRequestSchema,
  ListResourcesResponse_Type,
  ListResourcesResponseSchema,
  Scope,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { listResources } from 'protogen/redpanda/api/dataplane/v1/secret-SecretService_connectquery';
import { render, screen, waitFor } from 'test-utils';

global.ResizeObserver = class ResizeObserver {
  observe() {
    // Mock implementation
  }
  unobserve() {
    // Mock implementation
  }
  disconnect() {
    // Mock implementation
  }
};

Element.prototype.scrollIntoView = rs.fn();

import { SecretsStoreActionsCell } from './secrets-store-actions';
import type { SecretTableRow } from './secrets-store-list-page';

const DELETE_TEXT_REGEX = /delete/i;
const CONFIRMATION_PLACEHOLDER_REGEX = /type "delete" to confirm/i;

type RenderActionsCellOptions = {
  secret: SecretTableRow;
  onDelete: (secretId: string) => Promise<void>;
  resources: MessageInitShape<typeof ListResourcesResponseSchema>['resources'];
  deleteSecretMock?: ReturnType<typeof rs.fn>;
};

/** Renders the actions cell against a transport that lists `resources` for the secret. */
function renderActionsCell({ secret, onDelete, resources, deleteSecretMock }: RenderActionsCellOptions) {
  const listResourcesMock = rs.fn().mockReturnValue(
    create(ListResourcesResponseSchema, {
      resources,
    })
  );

  const transport = createRouterTransport(({ rpc }) => {
    if (deleteSecretMock) {
      rpc(deleteSecret, deleteSecretMock);
    }
    rpc(listResources, listResourcesMock);
  });

  const onEditMock = rs.fn();

  render(<SecretsStoreActionsCell isDeleting={false} onDelete={onDelete} onEdit={onEditMock} secret={secret} />, {
    transport,
  });

  return { listResourcesMock };
}

async function openDeleteDialog(user: UserEvent) {
  // Open the dropdown menu
  const menuButton = screen.getByTestId('secret-actions-menu-trigger');
  await user.click(menuButton);

  // Click the delete option to open the dialog
  const deleteMenuItem = await screen.findByText(DELETE_TEXT_REGEX);
  await user.click(deleteMenuItem);
}

async function confirmDelete(user: UserEvent) {
  // Wait for the confirmation dialog
  const confirmationInput = await screen.findByPlaceholderText(CONFIRMATION_PLACEHOLDER_REGEX);

  // Type the confirmation text
  await user.type(confirmationInput, 'delete');

  // Click the confirm delete button
  const confirmButton = screen.getByRole('button', { name: DELETE_TEXT_REGEX });
  await user.click(confirmButton);
}

describe('the SecretsStoreActionsCell', () => {
  test('should trigger delete mutation', async () => {
    const user = userEvent.setup();

    const mockSecret: SecretTableRow = {
      id: 'test-secret-id',
      labels: { env: 'production' },
      scopes: [Scope.MCP_SERVER],
      scope: '',
    };

    const deleteSecretMock = rs.fn().mockResolvedValue({});

    // Simulate the actual delete handler from the list page
    const handleDelete = async (secretId: string) => {
      await deleteSecretMock(
        create(DeleteSecretRequestSchema, {
          id: secretId,
        })
      );
    };

    renderActionsCell({ secret: mockSecret, onDelete: handleDelete, resources: [], deleteSecretMock });

    await openDeleteDialog(user);
    await confirmDelete(user);

    // Verify the delete mutation was called
    await waitFor(() => {
      expect(deleteSecretMock).toHaveBeenCalledTimes(1);
      expect(deleteSecretMock).toHaveBeenCalledWith(
        create(DeleteSecretRequestSchema, {
          id: 'test-secret-id',
        })
      );
    });
  });

  test('copies the secret ID from a menu item that keeps the menu open', async () => {
    const user = userEvent.setup();

    renderActionsCell({
      secret: { id: 'test-secret-copy', labels: {}, scopes: [Scope.AI_GATEWAY], scope: '' },
      onDelete: rs.fn(),
      resources: [],
    });

    await user.click(screen.getByTestId('secret-actions-menu-trigger'));
    const copyItem = await screen.findByRole('menuitem', { name: 'Copy ID' });
    expect(copyItem).toHaveAttribute('data-testid', 'secret-copy-id-button');

    await user.click(copyItem);

    await waitFor(async () => {
      expect(await navigator.clipboard.readText()).toBe('test-secret-copy');
    });
    expect(screen.getByRole('menuitem', { name: 'Copy ID' })).toBeVisible();
  });

  test('should show resources in use when secret is being used', async () => {
    const user = userEvent.setup();

    const mockSecret: SecretTableRow = {
      id: 'test-secret-in-use',
      labels: { env: 'staging' },
      scopes: [Scope.REDPANDA_CONNECT],
      scope: '',
    };

    const { listResourcesMock } = renderActionsCell({
      secret: mockSecret,
      onDelete: rs.fn(),
      resources: [
        {
          id: 'pipeline-1',
          displayName: 'My Pipeline',
          type: ListResourcesResponse_Type.PIPELINE,
        },
      ],
    });

    await openDeleteDialog(user);

    // Wait for resources query to be called with correct secret ID
    await waitFor(() => {
      expect(listResourcesMock).toHaveBeenCalledTimes(1);
    });

    // Verify the resource-in-use alert is displayed
    const alert = await screen.findByTestId('resource-in-use-alert');
    expect(alert).toBeInTheDocument();

    // Verify alert title and description
    await waitFor(() => {
      expect(screen.getByText('Resource is in use')).toBeInTheDocument();
    });

    // Verify the resource type label is shown
    expect(screen.getByText('Redpanda Connect Pipelines')).toBeInTheDocument();

    // Verify the specific resource is listed
    expect(screen.getByText('My Pipeline')).toBeInTheDocument();
  });
});

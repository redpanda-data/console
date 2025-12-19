import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import { deleteSecret } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  DeleteSecretRequestSchema,
  ListResourcesResponse_Type,
  ListResourcesResponseSchema,
  Scope,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { listResources } from 'protogen/redpanda/api/dataplane/v1/secret-SecretService_connectquery';
import { fireEvent, render, screen, waitFor } from 'test-utils';

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

Element.prototype.scrollIntoView = vi.fn();

import { SecretsStoreActionsCell } from './secrets-store-actions';
import type { SecretTableRow } from './secrets-store-list-page';

const DELETE_TEXT_REGEX = /delete/i;
const CONFIRMATION_PLACEHOLDER_REGEX = /type "delete" to confirm/i;

describe('SecretsStoreActionsCell', () => {
  test('should trigger delete mutation', async () => {
    const user = userEvent.setup();

    const mockSecret: SecretTableRow = {
      id: 'test-secret-id',
      labels: { env: 'production' },
      scopes: [Scope.MCP_SERVER],
      scope: '',
    };

    const deleteSecretMock = vi.fn().mockResolvedValue({});
    const listResourcesMock = vi.fn().mockReturnValue(
      create(ListResourcesResponseSchema, {
        resources: [],
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(deleteSecret, deleteSecretMock);
      rpc(listResources, listResourcesMock);
    });

    // Simulate the actual delete handler from the list page
    const handleDelete = async (secretId: string) => {
      await deleteSecretMock(
        create(DeleteSecretRequestSchema, {
          id: secretId,
        })
      );
    };

    const onEditMock = vi.fn();

    render(
      <SecretsStoreActionsCell isDeleting={false} onDelete={handleDelete} onEdit={onEditMock} secret={mockSecret} />,
      { transport }
    );

    // Open the dropdown menu
    const menuButton = screen.getByTestId('secret-actions-menu-trigger');
    await user.click(menuButton);

    // Click the delete option
    const deleteMenuItem = await screen.findByText(DELETE_TEXT_REGEX, {}, { timeout: 3000 });
    await user.click(deleteMenuItem);

    // Wait for the confirmation dialog
    const confirmationInput = await screen.findByPlaceholderText(CONFIRMATION_PLACEHOLDER_REGEX);

    // Type the confirmation text
    fireEvent.change(confirmationInput, { target: { value: 'delete' } });

    // Click the confirm delete button
    const confirmButton = screen.getByRole('button', { name: DELETE_TEXT_REGEX });
    fireEvent.click(confirmButton);

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

  test('should show resources in use when secret is being used', async () => {
    const user = userEvent.setup();

    const mockSecret: SecretTableRow = {
      id: 'test-secret-in-use',
      labels: { env: 'staging' },
      scopes: [Scope.REDPANDA_CONNECT],
      scope: '',
    };

    const onDeleteMock = vi.fn();
    const onEditMock = vi.fn();

    const listResourcesMock = vi.fn().mockReturnValue(
      create(ListResourcesResponseSchema, {
        resources: [
          {
            id: 'pipeline-1',
            displayName: 'My Pipeline',
            type: ListResourcesResponse_Type.PIPELINE,
          },
        ],
      })
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listResources, listResourcesMock);
    });

    render(
      <SecretsStoreActionsCell isDeleting={false} onDelete={onDeleteMock} onEdit={onEditMock} secret={mockSecret} />,
      { transport }
    );

    // Open the dropdown menu
    const menuButton = screen.getByTestId('secret-actions-menu-trigger');
    await user.click(menuButton);

    // Click the delete option to open the dialog
    const deleteMenuItem = await screen.findByText(DELETE_TEXT_REGEX, {}, { timeout: 3000 });
    await user.click(deleteMenuItem);

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

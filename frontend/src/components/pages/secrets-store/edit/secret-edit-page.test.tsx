import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import { GetSecretRequestSchema, GetSecretResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { getSecret, updateSecret } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  GetSecretRequestSchema as GetSecretRequestSchemaDataPlane,
  GetSecretResponseSchema as GetSecretResponseSchemaDataPlane,
  Scope,
  SecretSchema,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from 'test-utils';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
  addBearerTokenInterceptor: vi.fn((next) => async (request: unknown) => await next(request)),
}));

vi.mock('state/ui-state', () => ({
  uiState: {
    pageTitle: '',
    pageBreadcrumbs: [],
  },
}));

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

import { SecretEditPage } from './secret-edit-page';

const UPDATE_SECRET_BUTTON_REGEX = /update secret/i;

describe('SecretEditPage', () => {
  test('should update an existing secret', async () => {
    const user = userEvent.setup();

    const existingSecret = create(SecretSchema, {
      id: 'TEST_SECRET',
      scopes: [Scope.AI_GATEWAY],
      labels: { env: 'production' },
    });

    const getSecretMock = vi.fn().mockReturnValue(
      create(GetSecretResponseSchema, {
        response: create(GetSecretResponseSchemaDataPlane, {
          secret: existingSecret,
        }),
      })
    );

    const updateSecretMock = vi.fn().mockResolvedValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getSecret, getSecretMock);
      rpc(updateSecret, updateSecretMock);
    });

    render(
      <MemoryRouter initialEntries={['/secrets/TEST_SECRET/edit']}>
        <Routes>
          <Route element={<SecretEditPage />} path="/secrets/:id/edit" />
          <Route element={<div>Secrets List</div>} path="/secrets" />
        </Routes>
      </MemoryRouter>,
      { transport }
    );

    // Wait for secret to load
    await waitFor(() => {
      expect(getSecretMock).toHaveBeenCalledWith(
        create(GetSecretRequestSchema, {
          request: create(GetSecretRequestSchemaDataPlane, {
            id: 'TEST_SECRET',
          }),
        }),
        expect.anything()
      );
    });

    // Verify the form is populated with existing data
    await waitFor(() => {
      const idInput = screen.getByDisplayValue('TEST_SECRET');
      expect(idInput).toBeDisabled();
    });

    // Open the scopes multi-select using the testId
    const scopesButton = screen.getByTestId('secret-scopes-select');
    await user.click(scopesButton);

    // Wait for dropdown to open
    await waitFor(() => {
      const mcpServerElements = screen.getAllByText('MCP Server');
      expect(mcpServerElements.length).toBeGreaterThan(0);
      expect(mcpServerElements[0]).toBeVisible();
    });

    // Add MCP Server scope
    const mcpServerOption = screen.getAllByText('MCP Server')[0];
    await user.click(mcpServerOption);

    // Add Redpanda Connect scope
    const redpandaConnectOption = screen.getAllByText('Redpanda Connect')[0];
    await user.click(redpandaConnectOption);

    // Close the dropdown
    await user.keyboard('{Escape}');

    // Submit the form
    const submitButton = screen.getByRole('button', { name: UPDATE_SECRET_BUTTON_REGEX });
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });

    fireEvent.click(submitButton);

    // Verify the update mutation was called
    await waitFor(() => {
      expect(updateSecretMock).toHaveBeenCalledTimes(1);
    });
  });
});

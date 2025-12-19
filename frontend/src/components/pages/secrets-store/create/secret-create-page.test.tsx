import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent from '@testing-library/user-event';
import { ListSecretsResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { createSecret, listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { ListSecretsResponseSchema as ListSecretsResponseSchemaDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { fireEvent, render, screen, waitFor } from 'test-utils';

vi.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
  },
  isFeatureFlagEnabled: vi.fn(() => false),
  addBearerTokenInterceptor: vi.fn((next) => async (request) => await next(request)),
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

import { SecretCreatePage } from './secret-create-page';

const CREATE_SECRET_BUTTON_REGEX = /create secret/i;

describe('SecretCreatePage', () => {
  test('should create a new secret with all required fields', async () => {
    const user = userEvent.setup();

    const listSecretsMock = vi.fn().mockReturnValue(
      create(ListSecretsResponseSchema, {
        response: create(ListSecretsResponseSchemaDataPlane, {
          secrets: [],
        }),
      })
    );

    const createSecretMock = vi.fn().mockResolvedValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
      rpc(createSecret, createSecretMock);
    });

    render(
      <MemoryRouter initialEntries={['/secrets/create']}>
        <Routes>
          <Route element={<SecretCreatePage />} path="/secrets/create" />
          <Route element={<div>Secrets List</div>} path="/secrets" />
        </Routes>
      </MemoryRouter>,
      { transport }
    );

    // Verify the page loaded
    expect(screen.getByRole('heading', { name: 'Create Secret' })).toBeInTheDocument();

    // Fill in the ID field
    const idInput = screen.getByPlaceholderText('SECRET_ID');
    await user.type(idInput, 'MY_TEST_SECRET');

    // Fill in the value field
    const valueInput = screen.getByPlaceholderText('Enter secret value');
    await user.type(valueInput, 'super-secret-value');

    // Open the scopes multi-select using the testId
    const scopesButton = screen.getByTestId('secret-scopes-select');
    await user.click(scopesButton);

    // Wait for dropdown to open and select AI Gateway
    await waitFor(() => {
      const aiGatewayElements = screen.getAllByText('AI Gateway');
      expect(aiGatewayElements.length).toBeGreaterThan(0);
      expect(aiGatewayElements[0]).toBeVisible();
    });

    // Click on the first AI Gateway option in the dropdown
    const aiGatewayOption = screen.getAllByText('AI Gateway')[0];
    await user.click(aiGatewayOption);

    // Also select MCP Server
    const mcpServerOption = screen.getAllByText('MCP Server')[0];
    await user.click(mcpServerOption);

    // Close the dropdown
    await user.keyboard('{Escape}');

    // Submit the form
    const submitButton = screen.getByRole('button', { name: CREATE_SECRET_BUTTON_REGEX });
    await waitFor(() => {
      expect(submitButton).toBeEnabled();
    });

    fireEvent.click(submitButton);

    // Verify the create mutation was called
    await waitFor(() => {
      expect(createSecretMock).toHaveBeenCalledTimes(1);
    });
  });
});

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { ListSecretsResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { createSecret, listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { ListSecretsResponseSchema as ListSecretsResponseSchemaDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

rs.mock('config', () => ({
  config: {
    jwt: 'test-jwt-token',
    controlplaneUrl: 'http://localhost:9090',
  },
  isFeatureFlagEnabled: rs.fn(() => false),
  addBearerTokenInterceptor: rs.fn((next) => async (request: unknown) => await next(request)),
}));

rs.mock('state/ui-state', () => ({
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

Element.prototype.scrollIntoView = rs.fn();

import { SecretCreatePage } from './secret-create-page';

const CREATE_SECRET_BUTTON_REGEX = /create secret/i;

function renderCreatePage() {
  const listSecretsMock = rs.fn().mockReturnValue(
    create(ListSecretsResponseSchema, {
      response: create(ListSecretsResponseSchemaDataPlane, {
        secrets: [],
      }),
    })
  );

  const createSecretMock = rs.fn().mockResolvedValue({});

  const transport = createRouterTransport(({ rpc }) => {
    rpc(listSecrets, listSecretsMock);
    rpc(createSecret, createSecretMock);
  });

  renderWithFileRoutes(<SecretCreatePage />, { transport });

  return { createSecretMock };
}

/** Opens the scopes multi-select, picks both options by label, then closes the dropdown. */
async function selectScopes(user: UserEvent, firstLabel: string, secondLabel: string) {
  // Open the scopes multi-select using the testId
  const scopesButton = screen.getByTestId('secret-scopes-select');
  await user.click(scopesButton);

  // Wait for dropdown to open
  await waitFor(() => {
    const firstOptionElements = screen.getAllByText(firstLabel);
    expect(firstOptionElements.length).toBeGreaterThan(0);
    expect(firstOptionElements[0]).toBeVisible();
  });

  // Click on the first matching option in the dropdown for each label
  await user.click(screen.getAllByText(firstLabel)[0]);
  await user.click(screen.getAllByText(secondLabel)[0]);

  // Close the dropdown
  await user.keyboard('{Escape}');
}

async function submitWhenEnabled(user: UserEvent) {
  const submitButton = screen.getByRole('button', { name: CREATE_SECRET_BUTTON_REGEX });
  await waitFor(() => {
    expect(submitButton).toBeEnabled();
  });

  await user.click(submitButton);
}

describe('the SecretCreatePage', () => {
  test('should create a new secret with all required fields', async () => {
    const user = userEvent.setup();

    const { createSecretMock } = renderCreatePage();

    // Verify the page loaded. The page title itself is rendered by the app chrome (layout/header.tsx)
    // from uiState.pageTitle, which this harness does not mount, so assert on the page's own copy.
    expect(screen.getByText('Create a new secret that can be securely accessed by your services.')).toBeInTheDocument();

    // Fill in the ID field
    const idInput = screen.getByPlaceholderText('SECRET_ID');
    await user.type(idInput, 'MY_TEST_SECRET');

    // Fill in the value field
    const valueInput = screen.getByPlaceholderText('Enter secret value');
    await user.type(valueInput, 'super-secret-value');

    // Select AI Gateway and MCP Server
    await selectScopes(user, 'AI Gateway', 'MCP Server');

    // Submit the form
    await submitWhenEnabled(user);

    // Verify the create mutation was called
    await waitFor(() => {
      expect(createSecretMock).toHaveBeenCalledTimes(1);
    });
  });
});

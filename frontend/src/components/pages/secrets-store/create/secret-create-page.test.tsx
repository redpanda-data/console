import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { ListSecretsResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { createSecret, listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { ListSecretsResponseSchema as ListSecretsResponseSchemaDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { SecretCreatePage } from './secret-create-page';

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

global.ResizeObserver = rs.fn(function ResizeObserver() {
  return {
    observe: rs.fn(),
    unobserve: rs.fn(),
    disconnect: rs.fn(),
  };
});

Element.prototype.scrollIntoView = rs.fn();

const CREATE_SECRET_BUTTON_REGEX = /create secret/iu;

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

async function selectScopes(user: UserEvent, firstLabel: string, secondLabel: string) {
  const scopesButton = screen.getByTestId('secret-scopes-select');
  await user.click(scopesButton);

  await waitFor(() => {
    const firstOptionElements = screen.getAllByText(firstLabel);
    expect(firstOptionElements.length).toBeGreaterThan(0);
    expect(firstOptionElements[0]).toBeVisible();
  });

  await user.click(screen.getAllByText(firstLabel)[0]);
  await user.click(screen.getAllByText(secondLabel)[0]);

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

    const idInput = screen.getByPlaceholderText('SECRET_ID');
    await user.type(idInput, 'MY_TEST_SECRET');

    const valueInput = screen.getByPlaceholderText('Enter secret value');
    await user.type(valueInput, 'super-secret-value');

    await selectScopes(user, 'AI Gateway', 'MCP Server');

    await submitWhenEnabled(user);

    await waitFor(() => {
      expect(createSecretMock).toHaveBeenCalledTimes(1);
    });
  });
});

import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { GetSecretRequestSchema, GetSecretResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { getSecret, updateSecret } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  GetSecretRequestSchema as GetSecretRequestSchemaDataPlane,
  GetSecretResponseSchema as GetSecretResponseSchemaDataPlane,
  Scope,
  SecretSchema,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { renderWithFileRoutes, screen, waitFor } from 'test-utils';

import { SecretEditPage } from './secret-edit-page';

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

const SECRET_ID = 'TEST_SECRET';

rs.mock('@tanstack/react-router', () => {
  const actual = rs.requireActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
  return {
    ...actual,
    getRouteApi: () => ({
      useParams: () => ({ id: SECRET_ID }),
    }),
  };
});

global.ResizeObserver = rs.fn(function ResizeObserver() {
  return {
    observe: rs.fn(),
    unobserve: rs.fn(),
    disconnect: rs.fn(),
  };
});

Element.prototype.scrollIntoView = rs.fn();

const UPDATE_SECRET_BUTTON_REGEX = /update secret/iu;

function renderEditPage() {
  const existingSecret = create(SecretSchema, {
    id: 'TEST_SECRET',
    scopes: [Scope.AI_GATEWAY],
    labels: { env: 'production' },
  });

  const getSecretMock = rs.fn().mockReturnValue(
    create(GetSecretResponseSchema, {
      response: create(GetSecretResponseSchemaDataPlane, {
        secret: existingSecret,
      }),
    })
  );

  const updateSecretMock = rs.fn().mockResolvedValue({});

  const transport = createRouterTransport(({ rpc }) => {
    rpc(getSecret, getSecretMock);
    rpc(updateSecret, updateSecretMock);
  });

  renderWithFileRoutes(<SecretEditPage />, { transport });

  return { getSecretMock, updateSecretMock };
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
  const submitButton = screen.getByRole('button', { name: UPDATE_SECRET_BUTTON_REGEX });
  await waitFor(() => {
    expect(submitButton).toBeEnabled();
  });

  await user.click(submitButton);
}

describe('the SecretEditPage', () => {
  test('should update an existing secret', async () => {
    const user = userEvent.setup();

    const { getSecretMock, updateSecretMock } = renderEditPage();

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

    await waitFor(() => {
      const idInput = screen.getByDisplayValue('TEST_SECRET');
      expect(idInput).toBeDisabled();
    });

    // Add MCP Server and Redpanda Connect scopes
    await selectScopes(user, 'MCP Server', 'Redpanda Connect');

    await submitWhenEnabled(user);

    await waitFor(() => {
      expect(updateSecretMock).toHaveBeenCalledTimes(1);
    });
  });
});

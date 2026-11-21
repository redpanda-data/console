import { Code, ConnectError, createRouterTransport } from '@connectrpc/connect';
import { describe, expect, rs, test } from '@rstest/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CreateSecretRequest } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { createSecret } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { Scope } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { toast } from 'sonner';
import { connectQueryWrapper } from 'test-utils';

import { QuickAddSecrets } from './quick-add-secrets';

const CREATING = /Creating/;

function requiredSecretsServer() {
  const requests: CreateSecretRequest[] = [];
  const slowRequest = Promise.withResolvers<void>();
  let rejectBad = true;
  const transport = createRouterTransport(({ rpc }) => {
    rpc(createSecret, async (request) => {
      requests.push(request);
      if (request.request?.id === 'BAD' && rejectBad) {
        throw new ConnectError('Not allowed', Code.PermissionDenied);
      }
      if (request.request?.id === 'SLOW') {
        await slowRequest.promise;
      }
      return {};
    });
  });
  return {
    requests,
    transport,
    release: slowRequest.resolve,
    allowRetry: () => {
      rejectBad = false;
    },
  };
}

function renderRequiredSecrets() {
  const server = requiredSecretsServer();
  const callbacks = {
    onSecretsCreated: rs.fn<(names: string[]) => void>(),
    onError: rs.fn<(errors: string[]) => void>(),
    onUpdateEditorContent: rs.fn<(oldName: string, newName: string) => void>(),
  };
  const { wrapper } = connectQueryWrapper(undefined, server.transport);
  render(
    <QuickAddSecrets
      {...callbacks}
      existingSecrets={['existing']}
      requiredSecrets={['api-key', 'BAD', 'SLOW', 'EXISTING']}
      scopes={[Scope.REDPANDA_CONNECT]}
    />,
    { wrapper }
  );
  return { ...server, ...callbacks, user: userEvent.setup() };
}

async function submitRequiredSecrets(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('API_KEY'), 'api-value');
  await user.type(screen.getByLabelText('BAD'), 'retry-value');
  await user.type(screen.getByLabelText('SLOW'), 'slow-value');
  await user.click(screen.getByRole('button', { name: 'Create 3 secrets' }));
}

async function finishRequiredBatch(scenario: ReturnType<typeof renderRequiredSecrets>) {
  try {
    await waitFor(() => expect(scenario.requests).toHaveLength(3));
    expect(screen.getByRole('button', { name: CREATING })).toBeDisabled();
    expect(scenario.onSecretsCreated).not.toHaveBeenCalled();
  } finally {
    scenario.release();
  }
  await waitFor(() => expect(scenario.onSecretsCreated).toHaveBeenCalledWith(['API_KEY', 'SLOW']));
}

function expectPartialCreation(scenario: ReturnType<typeof renderRequiredSecrets>) {
  expect(scenario.onUpdateEditorContent).toHaveBeenCalledExactlyOnceWith('api-key', 'API_KEY');
  expect(scenario.onError.mock.calls).toEqual([[['Failed to create secret BAD: Not allowed']]]);
  expect(
    scenario.requests.map(({ request }) => ({
      id: request?.id,
      value: new TextDecoder().decode(request?.secretData),
      scopes: request?.scopes,
      labels: request?.labels,
    }))
  ).toEqual([
    { id: 'API_KEY', value: 'api-value', scopes: [Scope.REDPANDA_CONNECT], labels: {} },
    { id: 'BAD', value: 'retry-value', scopes: [Scope.REDPANDA_CONNECT], labels: {} },
    { id: 'SLOW', value: 'slow-value', scopes: [Scope.REDPANDA_CONNECT], labels: {} },
  ]);
  expect(screen.queryByLabelText('API_KEY')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('SLOW')).not.toBeInTheDocument();
}

function expectRequiredRetry(scenario: ReturnType<typeof renderRequiredSecrets>) {
  expect(scenario.requests.map(({ request }) => request?.id)).toEqual(['API_KEY', 'BAD', 'SLOW', 'BAD']);
  expect(scenario.requests[3]?.request?.secretData).toEqual(new TextEncoder().encode('retry-value'));
  expect(scenario.onSecretsCreated).toHaveBeenCalledTimes(2);
  expect(screen.queryByText('Required secrets are missing')).not.toBeInTheDocument();
}

function customSecretsServer() {
  const requests: CreateSecretRequest[] = [];
  let denyFirstCreate = true;
  const transport = createRouterTransport(({ rpc }) => {
    rpc(createSecret, (request) => {
      requests.push(request);
      if (denyFirstCreate) {
        denyFirstCreate = false;
        throw new ConnectError('Not allowed', Code.PermissionDenied);
      }
      return {};
    });
  });
  return { requests, transport };
}

function renderCustomSecrets(onError?: (errors: string[]) => void) {
  const server = customSecretsServer();
  const onSecretsCreated = rs.fn<(names: string[]) => void>();
  const { wrapper } = connectQueryWrapper(undefined, server.transport);
  render(
    <QuickAddSecrets
      defaultNewSecretName="used"
      enableNewSecrets
      existingSecrets={['used']}
      inline
      onError={onError}
      onSecretsCreated={onSecretsCreated}
      requiredSecrets={[]}
      scopes={[Scope.MCP_SERVER]}
    />,
    { wrapper }
  );
  return { ...server, onSecretsCreated, user: userEvent.setup() };
}

async function submitCustomSecret(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.clear(screen.getByLabelText('Secret name'));
  await user.type(screen.getByLabelText('Secret name'), name);
  await user.click(screen.getByRole('button', { name: 'Create Secret' }));
}

function expectCustomFailure(
  scenario: ReturnType<typeof renderCustomSecrets>,
  onError: ReturnType<typeof rs.fn<(errors: string[]) => void>>
) {
  expect(onError).toHaveBeenLastCalledWith(['Failed to create secret NEXT_KEY: Not allowed']);
  expect(scenario.onSecretsCreated).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Secret name')).toHaveValue('NEXT_KEY');
  expect(screen.getByLabelText('Secret value')).toHaveValue('custom-value');
}

async function retryCustomSecret(scenario: ReturnType<typeof renderCustomSecrets>) {
  await scenario.user.click(screen.getByRole('button', { name: 'Create Secret' }));
  await waitFor(() => expect(scenario.onSecretsCreated).toHaveBeenCalledExactlyOnceWith(['NEXT_KEY']));
  expect(scenario.requests.map(({ request }) => ({ id: request?.id, scopes: request?.scopes }))).toEqual([
    { id: 'NEXT_KEY', scopes: [Scope.MCP_SERVER] },
    { id: 'NEXT_KEY', scopes: [Scope.MCP_SERVER] },
  ]);
  expect(screen.getByLabelText('Secret name')).toHaveValue('USED');
  expect(screen.getByLabelText('Secret value')).toHaveValue('');
  expect(screen.getByText('Created secrets')).toBeInTheDocument();
  expect(screen.getByText('NEXT_KEY')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create Another Secret' })).toBeEnabled();
}

describe('quick add secrets', () => {
  test('awaits every required create, reports partial failures, and retries only missing secrets', async () => {
    const scenario = renderRequiredSecrets();
    await submitRequiredSecrets(scenario.user);
    await finishRequiredBatch(scenario);
    expectPartialCreation(scenario);
    scenario.allowRetry();
    await scenario.user.click(screen.getByRole('button', { name: 'Create 1 secret' }));
    await waitFor(() => expect(scenario.onSecretsCreated).toHaveBeenLastCalledWith(['BAD']));
    expectRequiredRetry(scenario);
  });

  test('rejects duplicate names without a request and preserves custom input until creation succeeds', async () => {
    const onError = rs.fn<(errors: string[]) => void>();
    const scenario = renderCustomSecrets(onError);
    await scenario.user.type(screen.getByLabelText('Secret value'), 'custom-value');
    await scenario.user.click(screen.getByRole('button', { name: 'Create Secret' }));
    await waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith(['Secret "USED" already exists']));
    expect(scenario.requests).toHaveLength(0);
    await submitCustomSecret(scenario.user, 'next-key');
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expectCustomFailure(scenario, onError);
    await retryCustomSecret(scenario);
  });

  test('reports transport failures with a toast when no error callback is provided', async () => {
    const errorToast = rs.spyOn(toast, 'error');
    const scenario = renderCustomSecrets();
    try {
      await scenario.user.type(screen.getByLabelText('Secret value'), 'custom-value');
      await submitCustomSecret(scenario.user, 'next-key');
      await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Failed to create secret NEXT_KEY: Not allowed'));
      expect(scenario.onSecretsCreated).not.toHaveBeenCalled();
    } finally {
      errorToast.mockRestore();
    }
  });
});

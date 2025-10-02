import { describe, expect, test, vi } from 'bun:test';
import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { CreateSecretRequestSchema, ListSecretsResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { createSecret, listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  CreateSecretRequestSchema as CreateSecretRequestSchemaDataPlane,
  CreateSecretResponseSchema,
  ListSecretsResponseSchema as ListSecretsResponseSchemaDataPlane,
  Scope,
  SecretSchema,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { act, fireEvent, render, screen, waitFor } from 'test-utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { CreateSecretModal } from './create-secret-modal';

describe('CreateSecretModal', () => {
  test('should let the user create a secret', async () => {
    const secret = create(SecretSchema, {
      id: 'SECRET_ID',
      labels: {
        key: 'value',
      },
      scopes: [Scope.REDPANDA_CONNECT],
    });

    const listSecretsResponse = create(ListSecretsResponseSchema, {
      response: create(ListSecretsResponseSchemaDataPlane, {
        secrets: [secret],
      }),
    });

    const listSecretsMock = vi.fn().mockReturnValue(listSecretsResponse);

    const createSecretMock = vi.fn().mockReturnValue(
      create(CreateSecretResponseSchema, {
        secret,
      }),
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
      rpc(createSecret, createSecretMock);
    });

    render(<CreateSecretModal isOpen onClose={() => {}} />, { transport });

    const secretId = 'SECRET_ID_2';
    const secretValue = 'secret_value';

    act(() => {
      fireEvent.change(screen.getByTestId('secret-id-field'), { target: { value: secretId } });
      fireEvent.change(screen.getByTestId('secret-value-field'), { target: { value: secretValue } });
    });

    act(() => {
      fireEvent.click(screen.getByRole('combobox'));
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    });

    act(() => {
      fireEvent.click(screen.getByText('Redpanda Connect'));
    });

    act(() => {
      fireEvent.click(screen.getByTestId('add-label-button'));
    });

    act(() => {
      fireEvent.change(screen.getByTestId('secret-labels-field-key-0'), { target: { value: 'environment' } });
      fireEvent.change(screen.getByTestId('secret-labels-field-value-0'), { target: { value: 'production' } });
    });

    act(() => {
      fireEvent.click(screen.getByTestId('add-label-button'));
    });

    act(() => {
      fireEvent.change(screen.getByTestId('secret-labels-field-key-1'), { target: { value: 'chuck' } });
      fireEvent.change(screen.getByTestId('secret-labels-field-value-1'), { target: { value: 'norris' } });
    });

    act(() => {
      fireEvent.click(screen.getByTestId('create-secret-button'));
    });

    await waitFor(() => {
      expect(createSecretMock).toHaveBeenCalledWith(
        create(CreateSecretRequestSchema, {
          request: create(CreateSecretRequestSchemaDataPlane, {
            id: secretId,
            secretData: base64ToUInt8Array(encodeBase64(secretValue)),
            scopes: [Scope.REDPANDA_CONNECT],
            labels: {
              environment: 'production',
              chuck: 'norris',
            },
          }),
        }),
        expect.anything(),
      );
    });
  });
});

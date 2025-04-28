import { createRouterTransport } from '@connectrpc/connect';
import { createSecret, listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import { CreateSecretRequest } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import {
  CreateSecretRequest as CreateSecretRequestDataPlane,
  ListSecretsRequest as ListSecretsRequestDataPlane,
  ListSecretsResponse as ListSecretsResponseDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { Scope, Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MAX_PAGE_SIZE } from 'react-query/react-query.utils';
import { fireEvent, render, screen, waitFor } from 'test-utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { CreateSecretModal } from './create-secret-modal';

describe('CreateSecretModal', () => {
  test('should let the user create a secret', async () => {
    const secret = new Secret({
      id: 'SECRET_ID',
      labels: {
        key: 'value',
      },
      scopes: [Scope.REDPANDA_CONNECT],
    });

    const listSecretsMock = vi.fn().mockReturnValue({
      response: new ListSecretsResponseDataPlane({
        secrets: [secret],
      }),
    });
    const createSecretMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
      rpc(createSecret, createSecretMock);
    });

    render(<CreateSecretModal isOpen onClose={() => {}} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('create-secret-button')).toBeVisible();

      expect(listSecretsMock).toHaveBeenCalledTimes(1);
      expect(listSecretsMock).toHaveBeenCalledWith(
        {
          request: new ListSecretsRequestDataPlane({
            pageSize: MAX_PAGE_SIZE,
            pageToken: '',
          }),
        },
        expect.anything(),
      );
    });

    const secretId = 'SECRET_ID_2';
    const secretValue = 'secret_value';

    fireEvent.change(screen.getByTestId('secret-id-field'), { target: { value: secretId } });
    fireEvent.change(screen.getByTestId('secret-value-field'), { target: { value: secretValue } });

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    await fireEvent.click(screen.getByText('Redpanda Connect'));

    fireEvent.click(screen.getByTestId('add-label-button'));

    fireEvent.change(screen.getByTestId('secret-labels-field-key-0'), { target: { value: 'environment' } });
    fireEvent.change(screen.getByTestId('secret-labels-field-value-0'), { target: { value: 'production' } });

    fireEvent.click(screen.getByTestId('add-label-button'));

    fireEvent.change(screen.getByTestId('secret-labels-field-key-1'), { target: { value: 'chuck' } });
    fireEvent.change(screen.getByTestId('secret-labels-field-value-1'), { target: { value: 'norris' } });

    fireEvent.click(screen.getByTestId('create-secret-button'));

    await waitFor(() => {
      expect(createSecretMock).toHaveBeenCalledTimes(1);
      expect(createSecretMock).toHaveBeenCalledWith(
        new CreateSecretRequest({
          request: new CreateSecretRequestDataPlane({
            id: secretId,
            // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
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

  test('should not allow creating secrets with duplicate secret IDs', async () => {
    const secret = new Secret({
      id: 'SECRET_ID',
      labels: {
        key: 'value',
      },
      scopes: [Scope.REDPANDA_CONNECT],
    });

    const listSecretsMock = vi.fn().mockReturnValue({
      response: new ListSecretsResponseDataPlane({
        secrets: [secret],
      }),
    });
    const createSecretMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
      rpc(createSecret, createSecretMock);
    });

    render(<CreateSecretModal isOpen onClose={() => {}} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('create-secret-button')).toBeVisible();

      expect(listSecretsMock).toHaveBeenCalledTimes(1);
      expect(listSecretsMock).toHaveBeenCalledWith(
        {
          request: new ListSecretsRequestDataPlane({
            pageSize: MAX_PAGE_SIZE,
            pageToken: '',
          }),
        },
        expect.anything(),
      );
    });

    fireEvent.change(screen.getByTestId('secret-id-field'), { target: { value: secret.id } });

    fireEvent.click(screen.getByTestId('create-secret-button'));

    await waitFor(() => {
      expect(createSecretMock).not.toHaveBeenCalled();
      expect(screen.getByText('ID is already in use')).toBeVisible();
      expect(screen.getByTestId('create-secret-button')).toBeDisabled();
    });
  });
});

import { createRouterTransport } from '@connectrpc/connect';
import { getPipelinesForSecret } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { GetPipelinesForSecretResponse } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { listSecrets, updateSecret } from 'protogen/redpanda/api/console/v1alpha1/secrets-SecretService_connectquery';
import { UpdateSecretRequest } from 'protogen/redpanda/api/console/v1alpha1/secrets_pb';
import {
  GetPipelinesForSecretRequest as GetPipelinesForSecretRequestDataPlane,
  GetPipelinesForSecretResponse as GetPipelinesForSecretResponseDataPlane,
  Pipeline,
  Pipeline_State,
  PipelinesForSecret,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  ListSecretsRequest as ListSecretsRequestDataPlane,
  ListSecretsResponse as ListSecretsResponseDataPlane,
  UpdateSecretRequest as UpdateSecretRequestDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { Scope, Secret } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MAX_PAGE_SIZE } from 'react-query/react-query.utils';
import { fireEvent, render, screen, waitFor, within } from 'test-utils';
import { base64ToUInt8Array, encodeBase64 } from 'utils/utils';
import { UpdateSecretModal } from './update-secret-modal';

describe('UpdateSecretModal', () => {
  test('should let the user update an existing secret with new value and labels', async () => {
    const existingSecretId = 'SECRET_ID';
    const existingLabels = {
      key: 'value',
      owner: 'console', // Won't be shown in the UI
    };

    const secret = new Secret({
      id: existingSecretId,
      labels: existingLabels,
      scopes: [Scope.REDPANDA_CONNECT],
    });

    const listSecretsMock = vi.fn().mockReturnValue({
      response: new ListSecretsResponseDataPlane({
        secrets: [secret],
      }),
    });
    const updateSecretMock = vi.fn().mockReturnValue({});
    const getPipelinesForSecretMock = vi.fn().mockReturnValue(
      new GetPipelinesForSecretResponse({
        response: new GetPipelinesForSecretResponseDataPlane({
          pipelinesForSecret: new PipelinesForSecret({
            secretId: existingSecretId,
            pipelines: [
              new Pipeline({
                id: 'pipeline-id',
                state: Pipeline_State.RUNNING,
              }),
            ],
          }),
        }),
      }),
    );

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
      rpc(updateSecret, updateSecretMock);
      rpc(getPipelinesForSecret, getPipelinesForSecretMock);
    });

    render(<UpdateSecretModal isOpen onClose={() => {}} secretId={existingSecretId} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('update-secret-button')).toBeVisible();
    });

    await waitFor(() => {
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

      expect(getPipelinesForSecretMock).toHaveBeenCalledTimes(1);
      expect(getPipelinesForSecretMock).toHaveBeenCalledWith(
        {
          request: new GetPipelinesForSecretRequestDataPlane({
            secretId: existingSecretId,
          }),
        },
        expect.anything(),
      );
    });

    const updatedSecretValue = 'updated_secret_value';

    fireEvent.change(screen.getByTestId('secret-value-field'), { target: { value: updatedSecretValue } });

    fireEvent.click(screen.getByTestId('add-label-button'));

    fireEvent.change(screen.getByTestId('secret-labels-field-key-1'), { target: { value: 'environment' } });
    fireEvent.change(screen.getByTestId('secret-labels-field-value-1'), { target: { value: 'production' } });

    fireEvent.click(screen.getByTestId('update-secret-button'));

    await waitFor(() => {
      expect(updateSecretMock).toHaveBeenCalledTimes(1);
      expect(updateSecretMock).toHaveBeenCalledWith(
        new UpdateSecretRequest({
          request: new UpdateSecretRequestDataPlane({
            id: existingSecretId,
            // @ts-ignore js-base64 does not play nice with TypeScript 5: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'Uint8Array<ArrayBuffer>'.
            secretData: base64ToUInt8Array(encodeBase64(updatedSecretValue)),
            scopes: [Scope.REDPANDA_CONNECT],
            labels: {
              key: 'value',
              environment: 'production',
            },
          }),
        }),
        expect.anything(),
      );
    });
  });

  test('should show a warning if the secret is in use', async () => {
    const secretId = 'SECRET_ID';

    const pipeline = new Pipeline({
      id: 'pipeline-id',
      state: Pipeline_State.RUNNING,
    });

    const listPipelinesForSecretMock = vi.fn().mockReturnValue({
      response: new GetPipelinesForSecretResponseDataPlane({
        pipelinesForSecret: new PipelinesForSecret({
          secretId,
          pipelines: [pipeline],
        }),
      }),
    });

    const updateSecretMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getPipelinesForSecret, listPipelinesForSecretMock);
      rpc(updateSecret, updateSecretMock);
    });

    render(<UpdateSecretModal secretId={secretId} isOpen onClose={() => {}} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('secret-in-use-alert')).toBeVisible();
      expect(within(screen.getByTestId('secret-in-use-alert')).getByText(pipeline.id)).toBeVisible();
    });
  });
});

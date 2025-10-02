import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { GetPipelinesForSecretResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { getPipelinesForSecret } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { ListSecretsResponseSchema, UpdateSecretRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { listSecrets, updateSecret } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  GetPipelinesForSecretResponseSchema as GetPipelinesForSecretResponseSchemaDataPlane,
  Pipeline_State,
  PipelineSchema,
  PipelinesForSecretSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import {
  ListSecretsResponseSchema as ListSecretsResponseSchemaDataPlane,
  Scope,
  SecretSchema,
  UpdateSecretRequestSchema as UpdateSecretRequestSchemaDataPlane,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
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

    const secret = create(SecretSchema, {
      id: existingSecretId,
      labels: existingLabels,
      scopes: [Scope.REDPANDA_CONNECT],
    });

    const listSecretsResponse = create(ListSecretsResponseSchema, {
      response: create(ListSecretsResponseSchemaDataPlane, {
        secrets: [secret],
        nextPageToken: '',
      }),
    });

    const listSecretsMock = vi.fn().mockReturnValue(listSecretsResponse);
    const updateSecretMock = vi.fn().mockReturnValue({});
    const getPipelinesForSecretMock = vi.fn().mockReturnValue(
      create(GetPipelinesForSecretResponseSchema, {
        response: create(GetPipelinesForSecretResponseSchemaDataPlane, {
          pipelinesForSecret: create(PipelinesForSecretSchema, {
            secretId: existingSecretId,
            pipelines: [
              create(PipelineSchema, {
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
      expect(listSecretsMock).toHaveBeenCalledTimes(1);
      expect(getPipelinesForSecretMock).toHaveBeenCalledTimes(1);
    });

    const updatedSecretValue = 'updated_secret_value';

    fireEvent.change(screen.getByTestId('secret-value-field'), { target: { value: updatedSecretValue } });

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    fireEvent.click(screen.getByText('Redpanda Connect'));

    fireEvent.click(screen.getByTestId('add-label-button'));

    fireEvent.change(screen.getByTestId('secret-labels-field-key-1'), { target: { value: 'environment' } });
    fireEvent.change(screen.getByTestId('secret-labels-field-value-1'), { target: { value: 'production' } });

    fireEvent.click(screen.getByTestId('update-secret-button'));

    await waitFor(() => {
      expect(updateSecretMock).toHaveBeenCalledTimes(1);
      expect(updateSecretMock).toHaveBeenCalledWith(
        create(UpdateSecretRequestSchema, {
          request: create(UpdateSecretRequestSchemaDataPlane, {
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

    const secret = create(SecretSchema, {
      id: secretId,
      scopes: [Scope.REDPANDA_CONNECT],
    });

    const listSecretsResponse = create(ListSecretsResponseSchema, {
      response: create(ListSecretsResponseSchemaDataPlane, {
        secrets: [secret],
        nextPageToken: '',
      }),
    });

    const pipeline = create(PipelineSchema, {
      id: 'pipeline-id',
      state: Pipeline_State.RUNNING,
    });

    const getPipelinesForSecretResponse = create(GetPipelinesForSecretResponseSchema, {
      response: create(GetPipelinesForSecretResponseSchemaDataPlane, {
        pipelinesForSecret: create(PipelinesForSecretSchema, {
          secretId,
          pipelines: [pipeline],
        }),
      }),
    });

    const listSecretsMock = vi.fn().mockReturnValue(listSecretsResponse);
    const listPipelinesForSecretMock = vi.fn().mockReturnValue(getPipelinesForSecretResponse);
    const updateSecretMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
      rpc(getPipelinesForSecret, listPipelinesForSecretMock);
      rpc(updateSecret, updateSecretMock);
    });

    render(<UpdateSecretModal secretId={secretId} isOpen onClose={() => {}} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('resource-in-use-alert')).toBeVisible();
      expect(within(screen.getByTestId('resource-in-use-alert')).getByText(pipeline.id)).toBeVisible();
    });
  });
});

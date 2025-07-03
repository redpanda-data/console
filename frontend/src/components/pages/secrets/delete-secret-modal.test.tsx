import { create } from '@bufbuild/protobuf';
import { createRouterTransport } from '@connectrpc/connect';
import { GetPipelinesForSecretResponseSchema } from 'protogen/redpanda/api/console/v1alpha1/pipeline_pb';
import { getPipelinesForSecret } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { DeleteSecretRequestSchema } from 'protogen/redpanda/api/console/v1alpha1/secret_pb';
import { deleteSecret } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  GetPipelinesForSecretResponseSchema as GetPipelinesForSecretResponseSchemaDataPlane,
  Pipeline_State,
  PipelineSchema,
  PipelinesForSecretSchema,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { DeleteSecretRequestSchema as DeleteSecretRequestSchemaDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { fireEvent, render, screen, waitFor, within } from 'test-utils';
import { DeleteSecretModal } from './delete-secret-modal';

describe('DeleteSecretModal', () => {
  test('should let the user delete a secret after entering confirmation text', async () => {
    const secretId = 'SECRET_ID';

    const pipelinesForSecretResponse = create(GetPipelinesForSecretResponseSchema, {
      response: create(GetPipelinesForSecretResponseSchemaDataPlane, {
        pipelinesForSecret: create(PipelinesForSecretSchema, {
          secretId,
          pipelines: [],
        }),
      }),
    });

    const listPipelinesForSecretMock = vi.fn().mockReturnValue(pipelinesForSecretResponse);
    const deleteSecretMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getPipelinesForSecret, listPipelinesForSecretMock);
      rpc(deleteSecret, deleteSecretMock);
    });

    render(<DeleteSecretModal secretId={secretId} isOpen onClose={() => {}} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('delete-secret-button')).toBeVisible();
    });

    fireEvent.click(screen.getByTestId('delete-secret-button'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-secret-button')).toBeVisible();
      expect(screen.getByTestId('delete-secret-button')).toBeDisabled();
    });

    fireEvent.change(screen.getByTestId('txt-confirmation-delete'), { target: { value: secretId } });

    await waitFor(() => {
      expect(screen.getByTestId('delete-secret-button')).toBeVisible();
      expect(screen.getByTestId('delete-secret-button')).toBeEnabled();
    });

    // Click the delete button
    fireEvent.click(screen.getByTestId('delete-secret-button'));

    // Verify that the delete mutation was called with the correct parameters
    await waitFor(() => {
      expect(deleteSecretMock).toHaveBeenCalledTimes(1);
      expect(deleteSecretMock).toHaveBeenCalledWith(
        create(DeleteSecretRequestSchema, {
          request: create(DeleteSecretRequestSchemaDataPlane, {
            id: secretId,
          }),
        }),
        expect.anything(),
      );
    });
  });

  test('should show a warning if the secret is in use', async () => {
    const secretId = 'SECRET_ID';

    const pipeline = create(PipelineSchema, {
      id: 'pipeline-id',
      state: Pipeline_State.RUNNING,
    });

    const pipelinesForSecretResponse = create(GetPipelinesForSecretResponseSchema, {
      response: create(GetPipelinesForSecretResponseSchemaDataPlane, {
        pipelinesForSecret: create(PipelinesForSecretSchema, {
          secretId,
          pipelines: [pipeline],
        }),
      }),
    });

    const listPipelinesForSecretMock = vi.fn().mockReturnValue(pipelinesForSecretResponse);
    const deleteSecretMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getPipelinesForSecret, listPipelinesForSecretMock);
      rpc(deleteSecret, deleteSecretMock);
    });

    render(<DeleteSecretModal secretId={secretId} isOpen onClose={() => {}} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('resource-in-use-alert')).toBeVisible();
      expect(within(screen.getByTestId('resource-in-use-alert')).getByText(pipeline.id)).toBeVisible();
    });
  });
});

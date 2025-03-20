import { createRouterTransport } from '@connectrpc/connect';
import { getPipelinesForSecret } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { deleteSecret } from 'protogen/redpanda/api/console/v1alpha1/secrets-SecretService_connectquery';
import { DeleteSecretRequest } from 'protogen/redpanda/api/console/v1alpha1/secrets_pb';
import {
  GetPipelinesForSecretResponse as GetPipelinesForSecretResponseDataPlane,
  Pipeline,
  Pipeline_State,
  PipelinesForSecret,
} from 'protogen/redpanda/api/dataplane/v1/pipeline_pb';
import { DeleteSecretRequest as DeleteSecretRequestDataPlane } from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { fireEvent, render, screen, waitFor, within } from 'test-utils';
import { DeleteSecretModal } from './delete-secret-modal';

describe('DeleteSecretModal', () => {
  test('should let the user delete a secret after entering confirmation text', async () => {
    const secretId = 'SECRET_ID';

    const listPipelinesForSecretMock = vi.fn().mockReturnValue({
      response: new GetPipelinesForSecretResponseDataPlane({
        pipelinesForSecret: new PipelinesForSecret({
          secretId,
          pipelines: [],
        }),
      }),
    });

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
        new DeleteSecretRequest({
          request: new DeleteSecretRequestDataPlane({
            id: secretId,
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

    const deleteSecretMock = vi.fn().mockReturnValue({});

    const transport = createRouterTransport(({ rpc }) => {
      rpc(getPipelinesForSecret, listPipelinesForSecretMock);
      rpc(deleteSecret, deleteSecretMock);
    });

    render(<DeleteSecretModal secretId={secretId} isOpen onClose={() => {}} />, { transport });

    await waitFor(() => {
      expect(screen.getByTestId('secret-in-use-alert')).toBeVisible();
      expect(within(screen.getByTestId('secret-in-use-alert')).getByText(pipeline.id)).toBeVisible();
    });
  });
});

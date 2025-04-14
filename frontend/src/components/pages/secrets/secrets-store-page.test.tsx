import { createRouterTransport } from '@connectrpc/connect';
import { listSecrets } from 'protogen/redpanda/api/console/v1alpha1/secret-SecretService_connectquery';
import {
  ListSecretsFilter,
  ListSecretsRequest as ListSecretsRequestDataPlane,
  ListSecretsResponse as ListSecretsResponseDataPlane,
  Scope,
  Secret,
} from 'protogen/redpanda/api/dataplane/v1/secret_pb';
import { MAX_PAGE_SIZE } from 'react-query/react-query.utils';
import { fireEvent, render, screen, waitFor } from 'test-utils';
import { SecretsStorePage } from './secrets-store-page';

describe('SecretsStorePage', () => {
  test('should list secrets with labels and scope and let user filter/search the data table view', async () => {
    const existingSecret = new Secret({
      id: 'SECRET_ID',
      labels: {
        key: 'value',
      },
      scopes: [Scope.REDPANDA_CONNECT],
    });

    const listSecretsMock = vi.fn().mockReturnValue({
      response: new ListSecretsResponseDataPlane({
        secrets: [existingSecret],
      }),
    });

    const transport = createRouterTransport(({ rpc }) => {
      rpc(listSecrets, listSecretsMock);
    });

    render(<SecretsStorePage />, { transport });

    await waitFor(() => {
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

    await waitFor(() => {
      expect(screen.getByText(existingSecret.id)).toBeVisible();
      expect(screen.getByText('RP Connect')).toBeVisible();
    });

    const nameContains = 'DIFFERENT_SECRET';

    fireEvent.change(screen.getByPlaceholderText('Filter secrets...'), { target: { value: nameContains } });

    await waitFor(() => {
      expect(listSecretsMock).toHaveBeenCalledWith(
        {
          request: new ListSecretsRequestDataPlane({
            filter: new ListSecretsFilter({
              nameContains,
            }),
          }),
        },
        expect.anything(),
      );
    });
  });
});
